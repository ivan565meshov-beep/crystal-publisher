// Приём заявок с сайта CRYSTAL FINANCE.
// Заявки хранятся только на этом сервере (в России, 152-ФЗ). Публикатор забирает по ключу лишь факт заявки
// (время и услугу) и шлёт уведомление в Telegram; сами данные владелец смотрит на /admin/leads (пароль nginx).
// Переменные окружения (файл /etc/crystal-site.env): PULL_KEY, PORT (по умолчанию 8090)
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 8090;
const DATA = process.env.DATA_DIR || '/var/lib/crystal-site';
fs.mkdirSync(DATA, { recursive: true });
const FILE = path.join(DATA, 'leads.jsonl');

const hits = new Map(); // защита от спама: не больше 5 заявок с одного IP за 10 минут
const limited = ip => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 6e5); a.push(now); hits.set(ip, a); return a.length > 5; };
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const crypto = require('crypto');
// сравнение ключа за постоянное время — по скорости ответа ключ не подобрать
const keyOk = req => { const k = process.env.PULL_KEY || '', g = String(req.headers['x-key'] || '');
  return k.length > 0 && g.length === k.length && crypto.timingSafeEqual(Buffer.from(g), Buffer.from(k)); };

// журнал защиты: отсечённые подозрительные отправки и итоги автозащиты сервера (уходит владельцу в бот через публикатор)
const SEC = path.join(DATA, 'security.jsonl');
const secLog = o => { try { if (fs.existsSync(SEC) && fs.statSync(SEC).size > 2e6) fs.renameSync(SEC, SEC + '.old');
  fs.appendFileSync(SEC, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n'); } catch {} };

// автозащита сервера: один раз на версию скрипта (программа работает от root, поэтому может настроить nginx и fail2ban)
const HARDEN_V = '1', HDONE = path.join(DATA, 'harden-v' + HARDEN_V + '.done');
function probeIps() {   // IP тех, кто отправлял проверочные заявки «PoC/probe/test»: ищем в журнале nginx по времени
  const probes = (fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)) : [])
    .filter(l => /\b(poc|probe|test)\b/i.test((l.name || '') + ' ' + (l.comment || '')) || /['"<>]/.test((l.name || '') + (l.phone || '')));
  const M = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const lines = ['/var/log/nginx/access.log', '/var/log/nginx/access.log.1'].filter(f => fs.existsSync(f))
    .flatMap(f => fs.readFileSync(f, 'utf8').split('\n')).filter(l => l.includes('POST /api/lead'));
  const hits = new Map();
  for (const l of lines) {
    const m = l.match(/^(\S+) \S+ \S+ \[(\d+)\/(\w+)\/(\d+):(\d+):(\d+):(\d+) ([+-]\d{4})\][^"]*"[^"]*" \d+ \d+ "[^"]*" "([^"]*)"/); if (!m) continue;
    const off = (m[8][0] === '-' ? -1 : 1) * (+m[8].slice(1, 3) * 60 + +m[8].slice(3)) * 6e4;
    const t = Date.UTC(+m[4], M[m[3]], +m[2], +m[5], +m[6], +m[7]) - off;
    if (probes.some(p => Math.abs(new Date(p.at).getTime() - t) < 3000)) hits.set(m[1], m[9]);
  }
  return hits;
}
function harden() {
  if (fs.existsSync(HDONE) || process.getuid?.() !== 0) return;
  fs.writeFileSync(HDONE, new Date().toISOString());          // сразу, чтобы не запускать повторно при перезапусках
  let ips = new Map(); try { ips = probeIps(); } catch {}
  const own = ['127.0.0.1', '::1'];
  const deny = [...ips.keys()].filter(ip => !own.includes(ip) && /^[0-9a-f.:]+$/i.test(ip));
  try { fs.writeFileSync('/etc/nginx/snippets/crystal-deny.conf', deny.map(ip => `deny ${ip};`).join('\n') + '\n'); } catch {}
  require('child_process').execFile('bash', [path.join(__dirname, '..', 'scripts', 'harden-auto.sh')], { timeout: 25 * 60e3 }, (err, out) => {
    const ok = (String(out).match(/^OK: (.*)$/m) || [])[1] || '', bad = (String(out).match(/^FAIL: (.*)$/m) || [])[1] || '';
    secLog({ type: 'report', ok, bad: bad || (err ? 'скрипт: ' + err.message.slice(0, 100) : ''),
      probes: deny.map(ip => ({ ip, ua: (ips.get(ip) || '').slice(0, 120) })) });
  });
}
setTimeout(harden, 5000);

http.createServer((req, res) => {
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
  // выдача заявок публикатору (он в Амстердаме и умеет слать в Telegram — из России Telegram API недоступен).
  // Только по секретному ключу и только по HTTPS (nginx); первично заявки хранятся здесь, в России.
  if (req.method === 'GET' && req.url.startsWith('/api/pull')) {
    if (!keyOk(req)) return json(403, { ok: false });
    const since = new URL(req.url, 'http://x').searchParams.get('since') || '';
    const rows = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(l => l.at > since) : [];
    // PULL_FULL=0 в /etc/crystal-site.env — отдавать только факт заявки (без имени/телефона), иначе — полностью
    const full = process.env.PULL_FULL !== '0';
    const ss = new URL(req.url, 'http://x').searchParams.get('ssince') || '';
    const security = ss && fs.existsSync(SEC) ? fs.readFileSync(SEC, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(l => l.at > ss).slice(0, 200) : [];
    return json(200, { ok: true, leads: rows.slice(0, 50).map(l => full ? l : ({ at: l.at, service: l.service })), security });
  }
  // список заявок для владельца — доступ закрыт паролем на уровне nginx (auth_basic)
  if (req.method === 'GET' && req.url.startsWith('/admin/leads')) {
    const esc = t => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const rows = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).reverse().slice(0, 200) : [];
    const tr = rows.map(l => `<tr><td>${esc(new Date(l.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' }))}</td><td>${esc(l.name)}</td>` +
      `<td><a href="tel:${esc(l.phone.replace(/[^\d+]/g, ''))}">${esc(l.phone)}</a></td><td>${esc(l.service)}</td><td>${esc(l.comment)}</td></tr>`).join('');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
    return res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Заявки — CRYSTAL FINANCE</title>
<style>body{font:15px -apple-system,sans-serif;margin:16px;background:#0b0e14;color:#e8eef6}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #223;text-align:left;vertical-align:top}a{color:#7cc4ff}</style>
<h2>Заявки с сайта (${rows.length})</h2><table><tr><th>Когда</th><th>Имя</th><th>Телефон</th><th>Услуга</th><th>Комментарий</th></tr>${tr}</table>`);
  }
  // статьи блога: публикатор собирает их из Notion и присылает готовые страницы по одной (gzip, только по ключу).
  // ?f=имя — положить файл во временную папку; ?commit=1 — заменить блог на новую версию целиком
  if (req.method === 'POST' && req.url.startsWith('/api/blog-sync')) {
    if (!keyOk(req)) return json(403, { ok: false });
    const q = new URL(req.url, 'http://x').searchParams, dir = path.join(__dirname, '..', 'site', 'blog'), tmp = dir + '.new';
    const parts = []; let n = 0;
    req.on('data', c => { n += c.length; if (n > 2e6) req.destroy(); else parts.push(c); });
    return req.on('end', () => {
      try {
        if (q.get('start')) { fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true }); return json(200, { ok: true }); }
        if (q.get('commit')) {
          if (!fs.existsSync(path.join(tmp, 'index.html'))) return json(400, { ok: false, error: 'нет index.html' });
          fs.rmSync(dir, { recursive: true, force: true }); fs.renameSync(tmp, dir); return json(200, { ok: true });
        }
        const f = q.get('f') || '';
        if (!/^[a-z0-9-]+\.(html|xml)$/.test(f)) return json(400, { ok: false, error: 'имя файла' });
        fs.mkdirSync(tmp, { recursive: true });
        fs.writeFileSync(path.join(tmp, f), require('zlib').gunzipSync(Buffer.concat(parts)));
        json(200, { ok: true });
      } catch (e) { json(400, { ok: false, error: e.message }); }
    });
  }
  if (req.method !== 'POST' || !req.url.startsWith('/api/lead')) return json(404, { ok: false });
  let body = '';
  req.on('data', c => { body += c; if (body.length > 20000) req.destroy(); });
  req.on('end', async () => {
    const f = new URLSearchParams(body), ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
    const ua = clean(req.headers['user-agent'], 150), junk = reason => { secLog({ type: 'blocked', ip, ua, reason, name: clean(f.get('name'), 40) }); return json(200, { ok: true }); };
    if (f.get('website')) return junk('ловушка для ботов');
    // отправка не из браузера или быстрее 3 секунд после открытия страницы — робот: делаем вид, что приняли
    if (!(Number(f.get('t')) >= 3000)) return junk('отправка не из браузера или слишком быстро');
    if (limited(ip)) return json(429, { ok: false, error: 'Слишком много заявок' });
    const lead = { at: new Date().toISOString(), name: clean(f.get('name'), 80), phone: clean(f.get('phone'), 30),
      service: clean(f.get('service'), 60), comment: clean(f.get('comment'), 1000), page: clean(req.headers.referer, 200),
      consent: f.get('consent') === 'yes' };
    // имя — только буквы, пробел, дефис; телефон — только цифры и + ( ) - пробел, 10–11 цифр
    if (/['"<>;`]/.test(lead.name + lead.phone)) return junk('попытка взлома (спецсимволы в имени/телефоне)');
    if (!/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё .\-]{0,79}$/.test(lead.name) || !/^[+\d\s()\-]+$/.test(lead.phone)) return json(400, { ok: false, error: 'Проверьте имя и телефон' });
    if (/\b(poc|probe|test|тест)\b/i.test(lead.name + ' ' + lead.comment)) return junk('проверочная отправка (PoC/test)');
    if (!lead.name || lead.phone.replace(/\D/g, '').length < 10 || lead.phone.replace(/\D/g, '').length > 11 || !lead.consent) return json(400, { ok: false, error: 'Проверьте имя, телефон и согласие' });
    fs.appendFileSync(FILE, JSON.stringify(lead) + '\n');            // запись в России — первой
    json(200, { ok: true });
  });
}).listen(PORT, '127.0.0.1', () => console.log('заявки: порт', PORT));
