// Приём заявок с сайта CRYSTAL FINANCE.
// Заявка сначала сохраняется на этом сервере (в России, 152-ФЗ), потом уведомление уходит в Telegram-бот заявок.
// Переменные окружения (файл /etc/crystal-site.env): LEADS_BOT_TOKEN, LEADS_CHAT_ID, PORT (по умолчанию 8090)
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 8090;
const DATA = process.env.DATA_DIR || '/var/lib/crystal-site';
fs.mkdirSync(DATA, { recursive: true });
const FILE = path.join(DATA, 'leads.jsonl');

const hits = new Map(); // защита от спама: не больше 5 заявок с одного IP за 10 минут
const limited = ip => { const now = Date.now(), a = (hits.get(ip) || []).filter(t => now - t < 6e5); a.push(now); hits.set(ip, a); return a.length > 5; };
const clean = (s, n) => String(s || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);

async function notify(lead) {
  const { LEADS_BOT_TOKEN: T, LEADS_CHAT_ID: C } = process.env;
  if (!T || !C) return;
  const text = `🔔 Заявка с сайта\n\n👤 ${lead.name}\n📞 ${lead.phone}\n📌 ${lead.service}` +
    (lead.comment ? `\n💬 ${lead.comment}` : '') + `\n🌐 ${lead.page || 'сайт'}\n🕒 ${new Date(lead.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })}`;
  try {
    await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: C, text }), signal: AbortSignal.timeout(10000) });
  } catch (e) { console.error('telegram', e.message); }
}

http.createServer((req, res) => {
  const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o)); };
  // выдача заявок публикатору (он в Амстердаме и умеет слать в Telegram — из России Telegram API недоступен).
  // Только по секретному ключу и только по HTTPS (nginx); первично заявки хранятся здесь, в России.
  if (req.method === 'GET' && req.url.startsWith('/api/pull')) {
    const key = process.env.PULL_KEY;
    if (!key || req.headers['x-key'] !== key) return json(403, { ok: false });
    const since = new URL(req.url, 'http://x').searchParams.get('since') || '';
    const rows = fs.existsSync(FILE) ? fs.readFileSync(FILE, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(l => l.at > since) : [];
    return json(200, { ok: true, leads: rows.slice(0, 50) });
  }
  if (req.method !== 'POST' || !req.url.startsWith('/api/lead')) return json(404, { ok: false });
  let body = '';
  req.on('data', c => { body += c; if (body.length > 20000) req.destroy(); });
  req.on('end', async () => {
    const f = new URLSearchParams(body), ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
    if (f.get('website')) return json(200, { ok: true });            // ловушка для ботов
    if (limited(ip)) return json(429, { ok: false, error: 'Слишком много заявок' });
    const lead = { at: new Date().toISOString(), name: clean(f.get('name'), 80), phone: clean(f.get('phone'), 30),
      service: clean(f.get('service'), 60), comment: clean(f.get('comment'), 1000), page: clean(req.headers.referer, 200),
      consent: f.get('consent') === 'yes' };
    if (!lead.name || lead.phone.replace(/\D/g, '').length < 10 || !lead.consent) return json(400, { ok: false, error: 'Проверьте имя, телефон и согласие' });
    fs.appendFileSync(FILE, JSON.stringify(lead) + '\n');            // запись в России — первой
    json(200, { ok: true });
    notify(lead);
  });
}).listen(PORT, '127.0.0.1', () => console.log('заявки: порт', PORT));
