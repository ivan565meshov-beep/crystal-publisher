// Telegram: публикация в канал и превью владельцу с кнопками
const fs = require('fs'), path = require('path');
const API = m => `https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/${m}`;
async function call(method, fields = {}, files = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  for (const [k, f] of Object.entries(files)) fd.append(k, await fs.openAsBlob(f), path.basename(f));
  const j = await (await fetch(API(method), { method: 'POST', body: fd })).json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`); return j.result;
}
const CAP = 1000;
// отправка поста: text | photos[] | video; длинный текст уходит отдельным сообщением
async function send(chat, { text = '', photos, video, keyboard }) {
  const capFits = text.length <= CAP, cap = capFits ? text : undefined; let first;
  if (photos?.length) {
    const media = photos.slice(0, 10).map((p, i) => ({ type: 'photo', media: `attach://p${i}`, ...(i === 0 && cap ? { caption: cap } : {}) }));
    const files = Object.fromEntries(photos.slice(0, 10).map((p, i) => [`p${i}`, p]));
    first = (await call('sendMediaGroup', { chat_id: chat, media }, files))[0];
  } else if (video) {
    first = await call('sendVideo', { chat_id: chat, caption: cap, supports_streaming: true, width: 1080, height: 1920 }, { video });
  }
  if (text && (!first || !capFits)) { const m = await call('sendMessage', { chat_id: chat, text }); first = first || m; }
  if (keyboard) await call('sendMessage', { chat_id: chat, text: keyboard.text, reply_markup: { inline_keyboard: keyboard.buttons } });
  return first;
}
const link = m => m?.chat?.username ? `https://t.me/${m.chat.username}/${m.message_id}` : null;
let offset = 0;
async function updates() {
  const r = await call('getUpdates', { offset, timeout: 0, allowed_updates: ['callback_query', 'message'] });
  if (r.length) offset = r[r.length - 1].update_id + 1; return r;
}
module.exports = { send, call, link, updates };
