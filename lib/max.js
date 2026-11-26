// MAX: пост в канал от имени бота (бот — админ канала)
// .env: MAX_TOKEN (токен бота с business.max.ru → «Чат-боты»), MAX_CHAT_ID (id канала; если пусто — найдём сами)
const fs = require('fs'), path = require('path');
const B = 'https://platform-api.max.ru';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(method, url, { query = {}, body } = {}) {
  const u = new URL(B + url);
  for (const [k, v] of Object.entries(query)) u.searchParams.set(k, v);
  const r = await fetch(u, { method, headers: { Authorization: process.env.MAX_TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = { message: t }; }
  if (!r.ok) { const e = new Error(`MAX ${url}: ${j.message || j.code || r.status}`); e.code = j.code; throw e; }
  return j;
}
const me = () => api('GET', '/me');
// каналы и чаты, где состоит бот
async function chats() { return (await api('GET', '/chats', { query: { count: 100 } })).chats || []; }
async function chatId() {
  if (process.env.MAX_CHAT_ID) return process.env.MAX_CHAT_ID;
  const ch = (await chats()).find(c => c.type === 'channel');
  if (!ch) throw new Error('MAX: бот не найден ни в одном канале — добавьте его в канал администратором');
  process.env.MAX_CHAT_ID = String(ch.chat_id);
  return process.env.MAX_CHAT_ID;
}
async function upload(type, file) {
  const s = await api('POST', '/uploads', { query: { type } });
  const fd = new FormData(); fd.append('data', await fs.openAsBlob(file), path.basename(file));
  const r = await fetch(s.url, { method: 'POST', headers: { Authorization: process.env.MAX_TOKEN }, body: fd });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`MAX загрузка ${type}: ${t.slice(0, 200)}`);
  // картинка: ответ — {photos:{...}} или {token}; видео: токен приходит ещё в ответе /uploads
  if (type === 'image') return j.photos ? { photos: j.photos } : { token: j.token };
  return { token: s.token || j.token };
}
async function post({ text = '', photos, video }) {
  const chat = await chatId(), attachments = [];
  for (const p of (photos || []).slice(0, 10)) attachments.push({ type: 'image', payload: await upload('image', p) });
  if (video) attachments.push({ type: 'video', payload: await upload('video', video) });
  const body = { text: text.slice(0, 4000), attachments: attachments.length ? attachments : undefined };
  // вложение может ещё обрабатываться — ждём и повторяем
  for (let i = 0; ; i++) {
    try { const r = await api('POST', '/messages', { query: { chat_id: chat }, body }); return r.message?.url || null; }
    catch (e) { if (i < 10 && /not.ready|attachment/i.test(e.code + e.message)) { await sleep(3000 * (i + 1)); continue; } throw e; }
  }
}
module.exports = { post, me, chats, chatId };
