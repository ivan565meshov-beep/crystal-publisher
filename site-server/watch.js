// Сторож: раз в минуту читает журналы nginx и fail2ban, находит атаки на сайт и сервер, пишет их в журнал защиты
// (оттуда — владельцу в бот) вместе с историей действий атакующего на сайте и блокирует его НАВСЕГДА:
// в nginx (сайт) и в брандмауэре ufw (весь сервер, включая SSH). Разблокировать — командой «разбан IP» в боте заявок.
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
const SAFE = new Set(['127.0.0.1', '::1', '72.56.91.118']);   // сам сервер и публикатор в Амстердаме — никогда не блокируются
const LOGS = ['/var/log/nginx/access.log', '/var/log/nginx/access.log.1'];
const RE = /^(\S+) \S+ \S+ \[([^\]]+)\] "(\S+) (\S+)[^"]*" (\d{3}) \d+ "([^"]*)" "([^"]*)"/;
const validIp = ip => /^[0-9a-f.:]+$/i.test(ip) && !SAFE.has(ip);

module.exports = function watch(DATA, secLog) {
  const ST = path.join(DATA, 'watch-state.json'), BANS = path.join(DATA, 'bans.json');
  const DENY = '/etc/nginx/snippets/crystal-deny.conf', PROBES = path.join(DATA, 'harden-probes.json');
  let st = {}; try { st = JSON.parse(fs.readFileSync(ST, 'utf8')); } catch {}
  let bans = {}; try { bans = JSON.parse(fs.readFileSync(BANS, 'utf8')); } catch {}
  // переход со старого формата (срок в миллисекундах) — теперь все блокировки постоянные
  for (const [ip, v] of Object.entries(bans)) if (typeof v !== 'object') bans[ip] = { since: new Date().toISOString(), kind: 'атака' };
  const root = process.getuid?.() === 0;

  const tail = (file, key) => {   // новые строки файла с прошлого раза (учитываем ротацию)
    try {
      const s = fs.statSync(file), prev = st[key] || {};
      let pos = prev.ino === s.ino && prev.pos <= s.size ? prev.pos : (prev.ino ? 0 : s.size);
      if (s.size - pos > 5e6) pos = s.size - 5e6;
      const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(s.size - pos); fs.readSync(fd, buf, 0, buf.length, pos); fs.closeSync(fd);
      st[key] = { ino: s.ino, pos: s.size };
      return buf.toString('utf8').split('\n').filter(Boolean);
    } catch { return []; }
  };
  // вся история адреса на сайте по журналам nginx: когда впервые, сколько запросов, что смотрел, с чем приходил
  const history = ip => {
    const rows = [];
    for (const f of LOGS) { try { for (const l of fs.readFileSync(f, 'utf8').split('\n')) if (l.startsWith(ip + ' ')) { const m = l.match(RE); if (m) rows.push(m); } } catch {} }
    if (!rows.length) return null;
    const uniq = (a, n) => [...new Set(a.filter(Boolean))].slice(0, n);
    const codes = {}; rows.forEach(m => { codes[m[5]] = (codes[m[5]] || 0) + 1; });
    return { requests: rows.length, first: rows[0][2], last: rows[rows.length - 1][2],
      paths: uniq(rows.map(m => m[3] + ' ' + m[4].slice(0, 80)), 15), agents: uniq(rows.map(m => m[7].slice(0, 100)), 5),
      referers: uniq(rows.map(m => m[6]).filter(r => r !== '-').map(r => r.slice(0, 80)), 5), codes };
  };
  const SCAN = /\/\.env|\/\.git|wp-(login|admin|content|includes)|xmlrpc|phpmyadmin|\/pma\b|cgi-bin|\.php\b|\/vendor\/|actuator|server-status|\/\.aws|\/config\.(json|ya?ml)|\/backup|\.sql\b|\.bak\b|\/etc\/passwd|\.\.\/|%2e%2e|\/boaform|HNAP1|\/shell|\/console|\/admin\.|\/login\.|\/owa\/|\/solr|\/jenkins/i;
  const INJ = /union(\s|%20|\+)+select|<script|%3cscript|sleep\(|benchmark\(|'(\s|%20|\+)*or(\s|%20|\+)+1=1|%27(%20|\+)*or|\$\{jndi/i;

  // применить блокировки: nginx (весь список, с проверкой конфига) + ufw (только новые адреса)
  function apply(newIps = [], removed = []) {
    if (!root) return;
    try {
    let perm = []; try { perm = JSON.parse(fs.readFileSync(PROBES, 'utf8')).map(p => p.ip); } catch {}
    const ips = [...new Set([...perm, ...Object.keys(bans)])].filter(validIp).filter(ip => !removed.includes(ip)).slice(0, 5000);
    let old = ''; try { old = fs.readFileSync(DENY, 'utf8'); } catch {}
    fs.writeFileSync(DENY, ips.map(ip => `deny ${ip};`).join('\n') + '\n');
    execFile('nginx', ['-t', '-q'], err => { if (err) { fs.writeFileSync(DENY, old); return; } execFile('systemctl', ['reload', 'nginx'], () => {}); });
    for (const ip of newIps.filter(validIp)) execFile('ufw', ['insert', '1', 'deny', 'from', ip, 'to', 'any'], () => {});
    for (const ip of removed.filter(validIp)) execFile('ufw', ['delete', 'deny', 'from', ip, 'to', 'any'], () => {});
    } catch (e) { console.error('блокировка:', e.message); }   // ошибка блокировки не должна ронять приём заявок
  }

  function tick() {
    if (root && !st.permDone && fs.existsSync(PROBES)) {   // проверявшие форму — тоже навсегда и в брандмауэре
      try { for (const p of JSON.parse(fs.readFileSync(PROBES, 'utf8'))) if (validIp(p.ip)) execFile('ufw', ['insert', '1', 'deny', 'from', p.ip, 'to', 'any'], () => {}); } catch {}
      st.permDone = true;
    }
    const ev = {};
    const add = (ip, kind, ua, sample) => { if (!validIp(ip)) return; const k = ip + '|' + kind;
      ev[k] = ev[k] || { ip, kind, ua: (ua || '').slice(0, 120), sample: (sample || '').slice(0, 120), n: 0 }; ev[k].n++; };
    const fails401 = {};
    for (const l of tail('/var/log/nginx/access.log', 'nginx')) {
      const m = l.match(RE); if (!m) continue;
      const [, ip, , method, url, code, , ua] = m;
      if (INJ.test(url)) add(ip, 'попытка взлома через адрес страницы (внедрение кода)', ua, url);
      else if (SCAN.test(url)) add(ip, 'сканирование уязвимостей (ищут служебные файлы и админки)', ua, url);
      if (code === '401' && url.startsWith('/admin')) fails401[ip] = (fails401[ip] || 0) + 1;
      if (code === '403' && /^\/api\/(pull|blog-sync|unban)/.test(url) && !bans[ip]) add(ip, 'попытка забрать заявки или изменить сайт без ключа', ua, method + ' ' + url.split('?')[0]);
    }
    for (const [ip, n] of Object.entries(fails401)) if (n >= 10) add(ip, `подбор пароля к странице заявок (${n} неверных попыток)`, '', '/admin/leads');
    for (const l of tail('/var/log/fail2ban.log', 'f2b')) { const m = l.match(/\[(\w+)\] Ban (\S+)/); if (m) add(m[2], 'подбор пароля к серверу (SSH)', '', m[1]); }
    const fresh = [];
    for (const e of Object.values(ev)) {
      const already = !!bans[e.ip];
      if (!already) { bans[e.ip] = { since: new Date().toISOString(), kind: e.kind }; fresh.push(e.ip); }
      secLog({ type: 'attack', ...e, ban: 'forever', repeat: already, hist: history(e.ip) });
    }
    fs.writeFileSync(ST, JSON.stringify(st)); fs.writeFileSync(BANS, JSON.stringify(bans));
    if (fresh.length) apply(fresh);
  }
  function ban(ip, kind) {
    if (!validIp(ip) || bans[ip]) return false;
    bans[ip] = { since: new Date().toISOString(), kind }; fs.writeFileSync(BANS, JSON.stringify(bans)); apply([ip]); return true;
  }
  function unban(ip) {
    const had = !!bans[ip]; delete bans[ip]; fs.writeFileSync(BANS, JSON.stringify(bans));
    try { const p = JSON.parse(fs.readFileSync(PROBES, 'utf8')); fs.writeFileSync(PROBES, JSON.stringify(p.filter(x => x.ip !== ip))); } catch {}
    apply([], [ip]); return had;
  }
  if (root) setInterval(() => { try { tick(); } catch (e) { console.error('сторож:', e.message); } }, 60e3);
  return { tick, ban, unban, history, list: () => bans };
};
