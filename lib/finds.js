// «🎯 Находки»: агенты «Охотник» и «Партнёры» кладут карточки в Notion, отсюда они уходят в бот заявок
// с кнопками «Взял в работу» / «Не подходит». .env: LEADS_BOT_TOKEN, LEADS_CHAT_ID, NOTION_TOKEN, NOTION_FINDS_DB (необязательно)
const fs = require('fs'), path = require('path');
const { api, txt } = require('./notion');
const DB = () => process.env.NOTION_FINDS_DB || '41c6bd0bdf8981e9b478cdec26090032';
const OFF = path.join(__dirname, '..', 'data', 'finds_offset.txt');
const esc = s => String(s || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const tg = async (method, body) => {
  const r = await fetch(`https://api.telegram.org/bot${process.env.LEADS_BOT_TOKEN}/${method}`, { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  const j = await r.json(); if (!j.ok) throw new Error('Telegram: ' + j.description); return j.result;
};
let warned = false;

// новые карточки → бот
async function send(log) {
  const { LEADS_BOT_TOKEN: T, LEADS_CHAT_ID: C } = process.env;
  if (!T || !C || !process.env.NOTION_TOKEN) return;
  let j;
  try { j = await api('POST', `/databases/${DB()}/query`, { page_size: 20, filter: { property: 'Отправлено', checkbox: { equals: false } } }); }
  catch (e) {   // база не открыта для интеграции Notion — сообщаем один раз
    if (!warned) { warned = true; await tg('sendMessage', { chat_id: C, text: '⚠️ Не могу открыть базу «🎯 Находки» в Notion: ' + e.message.slice(0, 200) }).catch(() => {}); }
    throw e;
  }
  for (const pg of j.results) {
    const P = pg.properties, type = P['Тип']?.select?.name || 'Клиент';
    const need = P['Что нужно']?.select?.name, hot = P['Срочность']?.select?.name, city = txt(P['Город']);
    const link = P['Ссылка']?.url, contacts = txt(P['Контакты']), answer = txt(P['Ответ']);
    const text = (type === 'Партнёр' ? '🤝 <b>Возможный партнёр</b>' : (hot === 'Горячий' ? '🔥' : '🎯') + ' <b>Находка: человеку нужна помощь</b>') +
      `\n\n<b>${esc(txt(P['Название']))}</b>` +
      (need ? `\n📌 ${esc(need)}` : '') + (city ? `\n📍 ${esc(city)}` : '') + (hot ? `\n⏱ ${esc(hot)}` : '') +
      (txt(P['Суть']) ? `\n\n${esc(txt(P['Суть']))}` : '') +
      (contacts ? `\n\n☎️ ${esc(contacts)}` : '') +
      (link ? `\n\n🔗 ${esc(link)}` : '') +
      (answer ? `\n\n✍️ <b>Вариант ответа</b> (нажмите, чтобы скопировать):\n<code>${esc(answer)}</code>` : '');
    await tg('sendMessage', { chat_id: C, text: text.slice(0, 4000), parse_mode: 'HTML', link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [[{ text: '✅ Взял в работу', callback_data: 'fw:' + pg.id }, { text: '✖️ Не подходит', callback_data: 'fx:' + pg.id }]] } });
    await api('PATCH', `/pages/${pg.id}`, { properties: { 'Отправлено': { checkbox: true }, ...(P['Статус']?.select ? {} : { 'Статус': { select: { name: 'Новая' } } }) } });
    log && log('находка отправлена', txt(P['Название']));
  }
}

// кнопки в боте заявок → статус карточки в Notion
async function buttons() {
  if (!process.env.LEADS_BOT_TOKEN) return;
  let offset = 0; try { offset = +fs.readFileSync(OFF, 'utf8') || 0; } catch {}
  const ups = await tg('getUpdates', { offset, timeout: 0, allowed_updates: ['callback_query', 'message'] });
  for (const u of ups) {
    offset = u.update_id + 1;
    // команды владельца в боте заявок: «ip 1.2.3.4» — досье, «разбан 1.2.3.4» — снять блокировку
    const msg = u.message;
    if (msg && String(msg.chat?.id) === String(process.env.LEADS_CHAT_ID)) {
      const m = String(msg.text || '').trim().match(/^\/?(ip|айпи|разбан|unban)\s+([0-9a-fA-F.:]{3,45})$/i);
      if (m) { await ipCommand(m[1].toLowerCase(), m[2]).catch(e => tg('sendMessage', { chat_id: msg.chat.id, text: '⚠️ ' + e.message.slice(0, 200) })); }
      else if (/^\/?(помощь|help|start)$/i.test(String(msg.text || '').trim()))
        await tg('sendMessage', { chat_id: msg.chat.id, text: 'Команды:\n• ip 1.2.3.4 — всё об адресе и его действия на сайте\n• разбан 1.2.3.4 — снять блокировку' });
      continue;
    }
    const q = u.callback_query; if (!q || !/^f[wx]:/.test(q.data || '')) continue;
    if (String(q.message?.chat?.id) !== String(process.env.LEADS_CHAT_ID)) continue;
    const ok = q.data.startsWith('fw:'), id = q.data.slice(3);
    await api('PATCH', `/pages/${id}`, { properties: { 'Статус': { select: { name: ok ? 'В работе' : 'Не подходит' } } } }).catch(() => {});
    await tg('answerCallbackQuery', { callback_query_id: q.id, text: ok ? 'Отметил: в работе' : 'Отметил: не подходит' }).catch(() => {});
    await tg('editMessageReplyMarkup', { chat_id: q.message.chat.id, message_id: q.message.message_id,
      reply_markup: { inline_keyboard: [[{ text: ok ? '✅ В работе' : '✖️ Не подходит', callback_data: 'noop' }]] } }).catch(() => {});
  }
  fs.mkdirSync(path.dirname(OFF), { recursive: true }); fs.writeFileSync(OFF, String(offset));
}
async function ipCommand(cmd, ip) {
  const base = (process.env.SITE_PULL_URL || 'https://crystalfinance.ru/api/pull').replace(/\/api\/pull.*$/, '');
  const call = async p => { const r = await fetch(base + p + '?ip=' + encodeURIComponent(ip), { headers: { 'X-Key': process.env.SITE_PULL_KEY || '' }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error('сайт ответил ' + r.status); return r.json(); };
  const C = process.env.LEADS_CHAT_ID;
  if (cmd === 'разбан' || cmd === 'unban') {
    const j = await call('/api/unban');
    return tg('sendMessage', { chat_id: C, text: j.removed ? `✅ ${ip} разблокирован (сайт и сервер).` : `ℹ️ ${ip} не был в списке блокировок. Если был среди проверявших форму — тоже снят.` });
  }
  const [site, { intel, card }] = await Promise.all([call('/api/ipcheck'), require('./ipintel')]);
  const info = await intel(ip);
  const st = site.banned ? `⛔ Заблокирован навсегда с ${new Date(site.banned.since).toLocaleString('ru-RU', { timeZone: 'Asia/Novokuznetsk' })} — ${site.banned.kind}` : '✅ Не заблокирован';
  return tg('sendMessage', { chat_id: C, text: (`🔍 Досье на адрес\n\n${card(ip, info, site.hist)}\n\n${st}` + (site.hist ? '' : '\n\nНа нашем сайте за последние дни этот адрес не появлялся.')).slice(0, 4000), link_preview_options: { is_disabled: true } });
}
module.exports = { send, buttons };
