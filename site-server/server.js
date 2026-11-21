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

http.createServer((req, res) => {
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
  // выдача заявок публикатору (он в Амстердаме и умеет слать в Telegram — из России Telegram API недоступен).
  // Только по секретному ключу и только по HTTPS (nginx); первично заявки хранятся здесь, в России.
  if (req.method === 'GET' && req.url.startsWith('/api/pull')) {
    const key = process.env.PULL_KEY;
    if (!key || req.headers['x-key'] !== key) return json(403, { ok: false });
    const since = new URL(req.url, 'http://x').searchParams.get('since') || '';
    const rows = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(l => l.at > since) : [];
    // PULL_FULL=0 в /etc/crystal-site.env — отдавать только факт заявки (без имени/телефона), иначе — полностью
    const full = process.env.PULL_FULL !== '0';
    return json(200, { ok: true, leads: rows.slice(0, 50).map(l => full ? l : ({ at: l.at, service: l.service })) });
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
    if (!process.env.PULL_KEY || req.headers['x-key'] !== process.env.PULL_KEY) return json(403, { ok: false });
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
    if (f.get('website')) return json(200, { ok: true });            // ловушка для ботов
    // отправка не из браузера или быстрее 3 секунд после открытия страницы — робот: делаем вид, что приняли
    if (!(Number(f.get('t')) >= 3000)) return json(200, { ok: true });
    if (limited(ip)) return json(429, { ok: false, error: 'Слишком много заявок' });
    const lead = { at: new Date().toISOString(), name: clean(f.get('name'), 80), phone: clean(f.get('phone'), 30),
      service: clean(f.get('service'), 60), comment: clean(f.get('comment'), 1000), page: clean(req.headers.referer, 200),
      consent: f.get('consent') === 'yes' };
    // имя — только буквы, пробел, дефис; телефон — только цифры и + ( ) - пробел, 10–11 цифр
    if (!/^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё .\-]{0,79}$/.test(lead.name) || !/^[+\d\s()\-]+$/.test(lead.phone)) return json(400, { ok: false, error: 'Проверьте имя и телефон' });
    if (/\b(poc|probe|test|тест)\b/i.test(lead.name + ' ' + lead.comment)) return json(200, { ok: true });   // тестовые/проверочные отправки не шлём владельцу
    if (!lead.name || lead.phone.replace(/\D/g, '').length < 10 || lead.phone.replace(/\D/g, '').length > 11 || !lead.consent) return json(400, { ok: false, error: 'Проверьте имя, телефон и согласие' });
    fs.appendFileSync(FILE, JSON.stringify(lead) + '\n');            // запись в России — первой
    json(200, { ok: true });
  });
}).listen(PORT, '127.0.0.1', () => console.log('заявки: порт', PORT));
