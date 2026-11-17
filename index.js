// Публикатор CRYSTAL FINANCE
// «На проверке» → собирает рилс/карусель и шлёт вам превью в Telegram с кнопками
// «Одобрено» → в «Дату публикации» публикует в Telegram-канал и VK → «Опубликовано»
require('./lib/env');
const fs = require('fs'), path = require('path');
const notion = require('./lib/notion'), tg = require('./lib/tg'), vk = require('./lib/vk');
const { voiceover } = require('./lib/tts'), { fetchBroll } = require('./lib/stock');
const { film } = require('./film'), { renderCarousel } = require('./render');
const WORK = path.join(__dirname, 'data', 'work'), OWNER = process.env.TG_OWNER_CHAT_ID;
const log = (...a) => console.log(new Date().toISOString(), ...a);

// собрать медиа по карточке (один раз, кладём в кэш)
async function build(card) {
  const dir = path.join(WORK, card.id), done = path.join(dir, 'media.json');
  if (fs.existsSync(done)) return JSON.parse(fs.readFileSync(done));
  fs.mkdirSync(dir, { recursive: true });
  const spec = await notion.spec(card.id); let media = {};
  if (spec?.type === 'reel' || (spec && card.format === 'Reels')) {
    await fetchBroll(spec, path.join(dir, 'broll'));
    const vd = await voiceover(spec.beats, path.join(dir, 'voice'));
    const out = path.join(dir, 'reel.mp4'); await film(spec, out, vd); media = { video: out };
  } else if (spec?.type === 'carousel' || (spec && card.format === 'Карусель')) {
    media = { photos: await renderCarousel(spec, path.join(dir, 'slides')) };
  }
  fs.writeFileSync(done, JSON.stringify(media)); return media;
}

async function previews() {
  if (!OWNER) return; // сначала напишите боту /start и впишите chat_id в .env
  for (const c of await notion.query('На проверке')) {
    if (c.preview) continue;
    try {
      const m = await build(c);
      await tg.send(OWNER, { text: c.text, ...m, keyboard: { text: `📝 «${c.title}»\n${c.platforms.join(', ') || 'площадка не указана'} · ${c.date || 'без даты'}\n${c.url}`,
        buttons: [[{ text: '✅ Одобрить', callback_data: `ok:${c.id}` }, { text: '✏️ Переделать', callback_data: `no:${c.id}` }]] } });
      await notion.update(c.id, { preview: true, error: '' }); log('превью', c.title);
    } catch (e) { log('ошибка превью', c.title, e.message); await notion.update(c.id, { error: 'Превью: ' + e.message, preview: true }); }
  }
}

// в старых карточках вместо имени бота стоит заглушка <бот>
const BOT = process.env.TG_BOT_USERNAME || 'croublisher_bot';
const fixText = t => (t || '').replace(/\\*<бот>|%3C%D0%B1%D0%BE%D1%82%3E/gi, BOT);

async function publish() {
  for (const c0 of await notion.query('Одобрено')) {
    const c = { ...c0, text: fixText(c0.text) };
    if (c.date && new Date(c.date) > new Date()) continue;
    try {
      const m = await build(c), links = [];
      if (c.platforms.includes('Telegram') && process.env.TG_CHANNEL) links.push(tg.link(await tg.send(process.env.TG_CHANNEL, { text: c.text, ...m })));
      if (c.platforms.includes('VK') && process.env.VK_TOKEN) links.push(await vk.post({ text: c.text, title: c.title, ...m }));
      await notion.update(c.id, { status: 'Опубликовано', link: links.filter(Boolean)[0], error: '' });
      if (OWNER) await tg.call('sendMessage', { chat_id: OWNER, text: `🚀 Опубликовано: «${c.title}»\n${links.filter(Boolean).join('\n')}` });
      log('опубликовано', c.title);
    } catch (e) {
      log('ошибка публикации', c.title, e.message);
      await notion.update(c.id, { status: 'Переделать', error: 'Публикация: ' + e.message });
      if (OWNER) await tg.call('sendMessage', { chat_id: OWNER, text: `⚠️ Не удалось опубликовать «${c.title}»: ${e.message}` });
    }
  }
}

// подарок за подписку: t.me/<бот>?start=gift или слово «чеклист» боту
const GIFT = path.join(__dirname, 'templates', 'checklist.pdf');
const CH = process.env.TG_CHANNEL, CH_URL = `https://t.me/${String(CH || '').replace('@', '')}`;
async function subscribed(userId) {
  try { const m = await tg.call('getChatMember', { chat_id: CH, user_id: userId }); return ['member', 'administrator', 'creator'].includes(m.status); }
  catch { return false; }
}
async function gift(chatId, userId) {
  if (await subscribed(userId)) {
    await tg.call('sendDocument', { chat_id: chatId, caption: 'Держите чек-лист: 12 проверок перед заявкой на кредит 📋\n\nЕсли хотите, чтобы мы проверили всё за вас, напишите @crystalfin54 слово РАЗБОР. Консультация бесплатная.' }, { document: GIFT });
    log('подарок выдан', userId);
  } else {
    await tg.call('sendMessage', { chat_id: chatId, text: 'Чек-лист «12 проверок перед заявкой на кредит» — подарок подписчикам канала CRYSTAL FINANCE. Там каждый день разборы: почему банки отказывают и как получить одобрение.\n\nПодпишитесь и нажмите «Я подписался» 👇',
      reply_markup: { inline_keyboard: [[{ text: '📢 Подписаться на канал', url: CH_URL }], [{ text: '✅ Я подписался', callback_data: 'gift' }]] } });
  }
}

// кнопки и правки владельца из Telegram
const waitingEdits = new Map();
async function buttons() {
  for (const u of await tg.updates()) {
    const q = u.callback_query, msg = u.message;
    if (q && q.data === 'gift') {
      await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: (await subscribed(q.from.id)) ? 'Отлично, отправляю!' : 'Пока не вижу подписки 🙂' });
      await gift(q.message.chat.id, q.from.id); continue;
    }
    if (msg?.text && (/^\/start gift/.test(msg.text) || /чек.?лист/i.test(msg.text))) { await gift(msg.chat.id, msg.from.id); continue; }
    if (q && String(q.from.id) === String(OWNER)) {
      const [act, id] = q.data.split(':');
      if (act === 'ok') { await notion.update(id, { status: 'Одобрено' }); await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: 'Одобрено — опубликую по расписанию' }); }
      if (act === 'no') { waitingEdits.set(String(OWNER), id); await tg.call('sendMessage', { chat_id: OWNER, text: 'Напишите одним сообщением, что поправить — передам SMM.' }); await tg.call('answerCallbackQuery', { callback_query_id: q.id }); }
    } else if (msg && String(msg.chat.id) === String(OWNER) && waitingEdits.has(String(OWNER)) && msg.text) {
      const id = waitingEdits.get(String(OWNER)); waitingEdits.delete(String(OWNER));
      await notion.update(id, { status: 'Переделать', edits: msg.text, preview: false });
      fs.rmSync(path.join(WORK, id), { recursive: true, force: true });
      await tg.call('sendMessage', { chat_id: OWNER, text: 'Принял, отправил на доработку.' });
    } else if (msg?.text === '/start') await tg.call('sendMessage', { chat_id: msg.chat.id, text: `Ваш chat_id: ${msg.chat.id}` });
  }
}

async function tick() {
  for (const f of [buttons, previews, publish]) { try { await f(); } catch (e) { log(f.name, e.message); } }
}
log('Публикатор запущен');
tick(); setInterval(tick, 60 * 1000);
