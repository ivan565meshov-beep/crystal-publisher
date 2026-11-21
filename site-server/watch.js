// Сторож: раз в минуту читает журналы nginx и fail2ban, находит атаки на сайт и сервер,
// пишет их в журнал защиты (оттуда — владельцу в бот) и сам блокирует сканеры в nginx на сутки.
const fs = require('fs'), path = require('path'), { execFile } = require('child_process');
module.exports = function watch(DATA, secLog) {
  if (process.getuid?.() !== 0) return;                      // нужен доступ к журналам и nginx
  const ST = path.join(DATA, 'watch-state.json'), BANS = path.join(DATA, 'bans.json');
  const DENY = '/etc/nginx/snippets/crystal-deny.conf', PROBES = path.join(DATA, 'harden-probes.json');
  const SAFE = new Set(['127.0.0.1', '::1', '72.56.91.118']);   // сам сервер и публикатор в Амстердаме
  let st = {}; try { st = JSON.parse(fs.readFileSync(ST, 'utf8')); } catch {}
  let bans = {}; try { bans = JSON.parse(fs.readFileSync(BANS, 'utf8')); } catch {}

  // новые строки файла с прошлого раза (учитываем ротацию журналов)
  const tail = (file, key) => {
    try {
      const s = fs.statSync(file), prev = st[key] || {};
      let pos = prev.ino === s.ino && prev.pos <= s.size ? prev.pos : (prev.ino ? 0 : s.size);   // первый запуск — с конца
      if (s.size - pos > 5e6) pos = s.size - 5e6;
      const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(s.size - pos); fs.readSync(fd, buf, 0, buf.length, pos); fs.closeSync(fd);
      st[key] = { ino: s.ino, pos: s.size };
      return buf.toString('utf8').split('\n').filter(Boolean);
    } catch { return []; }
  };
  const SCAN = /\/\.env|\/\.git|wp-(login|admin|content|includes)|xmlrpc|phpmyadmin|\/pma\b|cgi-bin|\.php\b|\/vendor\/|actuator|server-status|\/\.aws|\/config\.(json|ya?ml)|\/backup|\.sql\b|\.bak\b|\/etc\/passwd|\.\.\/|%2e%2e|\/boaform|HNAP1|\/shell|\/console|\/admin\.|\/login\.|\/owa\/|\/solr|\/jenkins/i;
  const INJ = /union(\s|%20|\+)+select|<script|%3cscript|sleep\(|benchmark\(|'(\s|%20|\+)*or(\s|%20|\+)+1=1|%27(%20|\+)*or|\$\{jndi/i;
  const RE = /^(\S+) \S+ \S+ \[[^\]]+\] "(\S+) (\S+)[^"]*" (\d{3}) \d+ "[^"]*" "([^"]*)"/;

  function tick() {
    const ev = {};   // ip|вид → событие
    const add = (ip, kind, ua, sample, ban) => { if (SAFE.has(ip)) return; const k = ip + '|' + kind;
      ev[k] = ev[k] || { ip, kind, ua: (ua || '').slice(0, 120), sample: (sample || '').slice(0, 120), n: 0, ban }; ev[k].n++; };
    const fails401 = {};
    for (const l of tail('/var/log/nginx/access.log', 'nginx')) {
      const m = l.match(RE); if (!m) continue;
      const [, ip, method, url, code, ua] = m;
      if (INJ.test(url)) add(ip, 'попытка взлома через адрес страницы (внедрение кода)', ua, url, 24);
      else if (SCAN.test(url)) add(ip, 'сканирование уязвимостей (ищут служебные файлы и админки)', ua, url, 24);
      if (code === '401' && url.startsWith('/admin')) fails401[ip] = (fails401[ip] || 0) + 1;
      if (code === '403' && /^\/api\/(pull|blog-sync)/.test(url)) add(ip, 'попытка забрать заявки или изменить сайт без ключа', ua, method + ' ' + url.split('?')[0], 24);
    }
    for (const [ip, n] of Object.entries(fails401)) if (n >= 5) add(ip, `подбор пароля к странице заявок (${n} неверных попыток)`, '', '/admin/leads', 1);
    for (const l of tail('/var/log/fail2ban.log', 'f2b')) {
      const m = l.match(/\[(\w+)\] Ban (\S+)/); if (m) add(m[2], 'подбор пароля к серверу (SSH) — fail2ban заблокировал на час', '', m[1]);
    }
    const now = Date.now(); let changed = false;
    for (const e of Object.values(ev)) {
      secLog({ type: 'attack', ...e });
      if (e.ban && !(bans[e.ip] > now)) { bans[e.ip] = now + e.ban * 3600e3; changed = true; }
    }
    for (const [ip, until] of Object.entries(bans)) if (until <= now) { delete bans[ip]; changed = true; }
    fs.writeFileSync(ST, JSON.stringify(st)); fs.writeFileSync(BANS, JSON.stringify(bans));
    if (changed) {   // nginx: постоянные (проверявшие форму) + временные баны; применяем только если конфиг проходит проверку
      let perm = []; try { perm = JSON.parse(fs.readFileSync(PROBES, 'utf8')).map(p => p.ip); } catch {}
      const ips = [...new Set([...perm, ...Object.keys(bans)])].filter(ip => /^[0-9a-f.:]+$/i.test(ip) && !SAFE.has(ip)).slice(0, 2000);
      let old = ''; try { old = fs.readFileSync(DENY, 'utf8'); } catch {}
      fs.writeFileSync(DENY, ips.map(ip => `deny ${ip};`).join('\n') + '\n');
      execFile('nginx', ['-t', '-q'], err => { if (err) { fs.writeFileSync(DENY, old); return; } execFile('systemctl', ['reload', 'nginx'], () => {}); });
    }
  }
  setInterval(() => { try { tick(); } catch (e) { console.error('сторож:', e.message); } }, 60e3);
  return tick;
};
