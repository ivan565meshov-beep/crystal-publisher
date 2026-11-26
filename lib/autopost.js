// Автопостинг: включён по умолчанию (выключить — /autopost_off).
// Публикуем только карточки, одобренные кнопкой «🚀 Опубликовать» после включения —
// старые «Одобрено» (их владелец выкладывал руками) не трогаем, чтобы не было дублей.
const fs = require('fs'), path = require('path');
const D = path.join(__dirname, '..', 'data'), F = path.join(D, 'autopost.json');
const read = () => { try { return JSON.parse(fs.readFileSync(F, 'utf8')); } catch { return { on: process.env.AUTO_PUBLISH !== '0', approved: [] }; } };
const save = s => { fs.mkdirSync(D, { recursive: true }); fs.writeFileSync(F, JSON.stringify(s)); };
const on = () => read().on;
const setOn = v => { const s = read(); s.on = !!v; save(s); };
const approve = id => { const s = read(); if (!s.approved.includes(id)) s.approved.push(id); s.approved = s.approved.slice(-200); save(s); };
const isApproved = id => read().approved.includes(id);
const done = id => { const s = read(); s.approved = s.approved.filter(x => x !== id); save(s); };
// какие площадки сейчас реально подключены
const ready = () => ({
  Telegram: !!process.env.TG_CHANNEL, VK: !!(process.env.VK_TOKEN && process.env.VK_GROUP_ID),
  MAX: !!process.env.MAX_TOKEN, Instagram: !!process.env.IG_TOKEN,
});
const autoFor = platforms => platforms.filter(p => ready()[p]);
module.exports = { on, setOn, approve, isApproved, done, ready, autoFor };
