// Забирает новые заявки с сайта (сервер в России) и присылает их в Telegram-бот заявок.
// .env: SITE_PULL_KEY, LEADS_BOT_TOKEN, LEADS_CHAT_ID, SITE_PULL_URL (по умолчанию https://crystalfinance.ru/api/pull)
const fs = require('fs'), path = require('path');
const STATE = path.join(__dirname, '..', 'data', 'site_leads_since.txt');
const since = () => { try { return fs.readFileSync(STATE, 'utf8').trim(); } catch { return new Date().toISOString(); } };

async function pull(log) {
  const { SITE_PULL_KEY: K, LEADS_BOT_TOKEN: T, LEADS_CHAT_ID: C } = process.env;
  if (!K || !T || !C) return;
  const url = (process.env.SITE_PULL_URL || 'https://crystalfinance.ru/api/pull') + '?since=' + encodeURIComponent(since());
  const r = await fetch(url, { headers: { 'X-Key': K }, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('сайт ответил ' + r.status);
  const { leads = [] } = await r.json();
  for (const l of leads) {
    const text = `🔔 Заявка с сайта\n\n👤 ${l.name}\n📞 ${l.phone}\n📌 ${l.service}` + (l.comment ? `\n💬 ${l.comment}` : '') +
      `\n🌐 ${l.page || 'сайт'}\n🕒 ${new Date(l.at).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })}`;
    const s = await fetch(`https://api.telegram.org/bot${T}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: C, text }), signal: AbortSignal.timeout(15000) });
    if (!s.ok) throw new Error('Telegram ' + s.status);
    fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, l.at);
    log && log('заявка с сайта →', l.name);
  }
}
module.exports = { pull };
