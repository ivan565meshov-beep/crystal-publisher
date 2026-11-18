// Забирает новые заявки с сайта (сервер в России) и присылает их в Telegram-бот заявок.
// .env: SITE_PULL_KEY, LEADS_BOT_TOKEN, LEADS_CHAT_ID, SITE_PULL_URL (по умолчанию https://crystalfinance.ru/api/pull)
const fs = require('fs'), path = require('path');
const STATE = path.join(__dirname, '..', 'data', 'site_leads_since.txt');
// первая проверка забирает заявки за последние сутки, дальше — только новые после последней отправленной
const since = () => { try { return fs.readFileSync(STATE, 'utf8').trim(); } catch {
  const t = new Date(Date.now() - 864e5).toISOString(); fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, t); return t; } };

async function pull(log) {
  const { SITE_PULL_KEY: K, LEADS_BOT_TOKEN: T, LEADS_CHAT_ID: C } = process.env;
  if (!K || !T || !C) return;
  const url = (process.env.SITE_PULL_URL || 'https://crystalfinance.ru/api/pull') + '?since=' + encodeURIComponent(since());
  const r = await fetch(url, { headers: { 'X-Key': K }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('сайт ответил ' + r.status);
  const { leads = [] } = await r.json();
  for (const l of leads) {
    const text = l.phone
      ? `🔔 Заявка с сайта\n\n👤 ${l.name}\n📞 ${l.phone}\n📌 ${l.service}` + (l.comment ? `\n💬 ${l.comment}` : '') +
        `\n🕒 ${new Date(l.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })}`
      : `🔔 Новая заявка с сайта\n📌 ${l.service || 'услуга не указана'}\n🕒 ${new Date(l.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })}\n\nОткрыть: https://crystalfinance.ru/admin/leads`;
    const s = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: C, text }), signal: AbortSignal.timeout(15000) });
    if (!s.ok) throw new Error('Telegram ' + s.status);
    fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, l.at);
    log && log('заявка с сайта', l.at);
  }
}
module.exports = { pull };
