// Публикатор CRYSTAL FINANCE
// «На проверке» → собирает рилс/карусель и шлёт вам превью в Telegram с кнопками
// «Одобрено» → в «Дату публикации» публикует в Telegram-канал, VK и Instagram → «Опубликовано»
require('./lib/env');
const fs = require('fs'), path = require('path');
const notion = require('./lib/notion'), tg = require('./lib/tg'), vk = require('./lib/vk'), ig = require('./lib/ig');
const { voiceover } = require('./lib/tts'), { fetchBroll } = require('./lib/stock');
const { film } = require('./film'), { renderCarousel } = require('./render');
const WORK = path.join(__dirname, 'data', 'work'), OWNER = process.env.TG_OWNER_CHAT_ID;
const ENGINE = '4';
const log = (...a) => console.log(new Date().toISOString(), ...a);

// в старых карточках вместо имени бота стоит заглушка <бот>
const BOT = process.env.TG_BOT_USERNAME || 'croublisher_bot';
const fixText = t => (t || '').replace(/\\*<бот>|%3C%D0%B1%D0%BE%D1%82%3E/gi, BOT);

// Рилсы выходят в Instagram — там нет бота и Telegram. Финальный призыв всегда один:
// «Подпишись и напиши в директ кодовое слово «…»» (слово своё в каждом ролике), без ботов и ссылок.
function instaCta(spec) {
  spec.handle = 'в директ';
  const b = spec.beats?.[spec.beats.length - 1];
  if (!b || b.show?.kind !== 'cta') return;
  const kw = (b.show.keyword || 'РАЗБОР').toUpperCase();
  b.show.keyword = kw; b.show.handle = 'в директ'; b.show.sub = 'Подпишись';
  if (/бот|telegram|телеграм|канал|t\.me/i.test(b.say) || !/директ/i.test(b.say))
    b.say = `Подпишись и напиши в директ кодовое слово «${kw.toLowerCase()}» — разберём твою ситуацию бесплатно.`;
}
const instaText = (t, spec) => {
  const kw = spec?.beats?.at(-1)?.show?.keyword;
  let out = (t || '').split('\n').filter(l => !/бот|t\.me|telegram|телеграм|<бот>|@crystalfin54|подпишитесь на канал/i.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (kw && !/директ/i.test(out)) out += `\n\nПодпишись и напиши в директ кодовое слово ${kw} — разберём твою ситуацию бесплатно.`;
  return out;
};

// собрать медиа по карточке (один раз, кладём в кэш)
async function build(card) {
  const dir = path.join(WORK, card.id), done = path.join(dir, 'media.json');
  // ENGINE — версия движка: ролики, собранные старой версией (например, со сломанным звуком), пересобираются
  if (fs.existsSync(done)) { const m = JSON.parse(fs.readFileSync(done)); if (m.engine === ENGINE) return m; fs.rmSync(dir, { recursive: true, force: true }); }
  fs.mkdirSync(dir, { recursive: true });
  const spec = await notion.spec(card.id); let media = {};
  // рилс или карусель без сценария не публикуем голым текстом — возвращаем SMM
  if (!spec && (card.format === 'Reels' || card.format === 'Карусель')) {
    fs.rmSync(dir, { recursive: true, force: true });
    const e = new Error('нет JSON-сценария в карточке'); e.noSpec = true; throw e;
  }
  if (spec?.type === 'cartoon') {
    media = { video: await require('./cartoon').cartoon(spec, dir) };
  } else if (spec?.type === 'reel' || (spec && card.format === 'Reels')) {
    instaCta(spec);
    await fetchBroll(spec, path.join(dir, 'broll'));
    const vd = await voiceover(spec.beats, path.join(dir, 'voice'));
    const out = path.join(dir, 'reel.mp4'); await film(spec, out, vd); media = { video: out };
  } else if (spec?.type === 'carousel' || (spec && card.format === 'Карусель')) {
    media = { photos: await renderCarousel(spec, path.join(dir, 'slides')) };
  }
  media.engine = ENGINE; fs.writeFileSync(done, JSON.stringify(media)); return media;
}

// счётчик попыток: если карточка роняет сборку, после 3 попыток откладываем её с ошибкой
const ATT = path.join(__dirname, 'data', 'attempts.json');
const BUILDING = path.join(__dirname, 'data', 'building.json');
const att = () => { try { return JSON.parse(fs.readFileSync(ATT)); } catch { return {}; } };
const setAtt = o => { fs.mkdirSync(path.dirname(ATT), { recursive: true }); fs.writeFileSync(ATT, JSON.stringify(o)); };
async function previews() {
  if (!/^-?\d+$/.test(String(OWNER || ''))) return; // сначала напишите боту /start и впишите chat_id в .env
  // мультсерии первыми: их клипы по ссылкам ElevenLabs живут несколько часов
  // порядок: мультсерии первыми (ссылки на клипы живут недолго), дальше по дате публикации и номеру серии (#1, #2…),
  // чтобы серии приходили и выходили по порядку, а не вперемешку
  const num = t => +((t.match(/#\s*(\d+)/) || [])[1] || 0);
  const list = (await notion.query('На проверке')).sort((a, b) =>
    (/мультсери/i.test(b.title) - /мультсери/i.test(a.title)) || String(a.date || '9').localeCompare(String(b.date || '9')) || num(a.title) - num(b.title));
  for (const c of list) {
    if (c.preview) continue;
    const a = att(); a[c.id] = (a[c.id] || 0) + 1; setAtt(a);
    if (a[c.id] > 3) { await notion.update(c.id, { preview: true, error: 'Превью: сборка не удалась 3 раза — проверьте сценарий' }); continue; }
    try {
      // отметка «собираю»: если процесс упадёт посреди сборки, после перезапуска это будет видно в карточке
      fs.writeFileSync(BUILDING, JSON.stringify({ id: c.id, title: c.title, at: Date.now() }));
      await tg.send(OWNER, { text: `⏳ Собираю «${c.title}» — пришлю через несколько минут` }).catch(() => {});
      const m = await build(c);
      fs.rmSync(BUILDING, { force: true });
      // Тредс: каждый пост ветки — отдельным сообщением, чтобы удобно копировать по одному
      if (c.format === 'Тредс') {
        const posts = (c.text || '').split(/\n\s*-{3,}\s*\n/).map(t => t.trim()).filter(Boolean);
        for (let k = 0; k < posts.length; k++) await tg.send(OWNER, { text: `${k + 1}/${posts.length}\n\n${posts[k]}` });
      }
      await tg.send(OWNER, { text: c.format === 'Тредс' ? '' : c.format === 'Reels' ? instaText(c.text, await notion.spec(c.id)) : fixText(c.text), ...m, keyboard: { text: `📝 «${c.title}»\n${c.platforms.join(', ') || 'площадка не указана'} · ${c.date || 'без даты'}\n${c.url}`,
        buttons: [[{ text: '✅ Одобрить', callback_data: `ok:${c.id}` }, { text: '✏️ Переделать', callback_data: `no:${c.id}` }]] } });
      await notion.update(c.id, { preview: true, error: '' }); log('превью', c.title);
      const a2 = att(); delete a2[c.id]; setAtt(a2);
    } catch (e) {
      fs.rmSync(BUILDING, { force: true });
      log('ошибка превью', c.title, e.message);
      await tg.send(OWNER, { text: `⚠️ «${c.title}» не собрался: ${e.message.slice(0, 300)}` }).catch(() => {});
      // голос ещё не добавлен в ElevenLabs — не тратим попытки, ждём и не перебираем остальные карточки
      if (/My Voices/.test(e.message)) { const a3 = att(); a3[c.id] = Math.max(0, (a3[c.id] || 1) - 1); setAtt(a3); await notion.update(c.id, { error: e.message }); return; }
      if (e.noSpec) await notion.update(c.id, { status: 'Переделать', edits: 'Нет JSON-сценария: сделай рилс/карусель по формату из инструкции SMM', error: '' });
      else await notion.update(c.id, { error: 'Превью (попытка ' + (att()[c.id] || 1) + '): ' + e.message.slice(0, 300) });
    }
  }
}


// не чаще одного поста в MIN_GAP_MIN минут (по умолчанию 120) — чтобы просроченные не вышли пачкой
const LAST = path.join(__dirname, 'data', 'last_publish.txt');
const gapOk = () => { try { return Date.now() - Number(fs.readFileSync(LAST, 'utf8')) > Number(process.env.MIN_GAP_MIN || 120) * 6e4; } catch { return true; } };
// по умолчанию автопостинг выключен: владелец публикует сам. Включить: AUTO_PUBLISH=1 в .env
const AUTO = process.env.AUTO_PUBLISH === '1';
async function publish() {
  if (!AUTO) return;
  const due = (await notion.query('Одобрено')).filter(c => !c.date || new Date(c.date) <= new Date())
    .sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
  for (const c0 of due) {
    // только Дзен (или нет автоплощадок) — публикуется вручную, автопостинг пропускает
    const auto = c0.platforms.filter(x => ['Telegram', 'VK', 'Instagram'].includes(x));
    if (!auto.length) continue;
    if (!gapOk()) return;
    const c = { ...c0, text: fixText(c0.text) };
    let m;
    try { m = await build(c); } catch (e) {
      log('ошибка сборки', c.title, e.message);
      await notion.update(c.id, { status: 'Переделать', error: 'Сборка: ' + e.message });
      if (OWNER) await tg.call('sendMessage', { chat_id: OWNER, text: `⚠️ Не удалось собрать «${c.title}»: ${e.message}` });
      continue;
    }
    // каждая площадка отдельно: ошибка в одной не мешает остальным и не вызывает повторной публикации
    const targets = [
      ['Telegram', process.env.TG_CHANNEL, async () => tg.link(await tg.send(process.env.TG_CHANNEL, { text: c.text, ...m }))],
      ['VK', process.env.VK_TOKEN, () => vk.post({ text: c.text, title: c.title, ...m })],
      ['Instagram', process.env.IG_TOKEN, () => ig.post({ text: c.text, ...m })],
    ];
    const links = [], errs = [];
    for (const [name, on, run] of targets) {
      if (!c.platforms.includes(name) || !on) continue;
      try { const l = await run(); links.push(`${name}: ${l || 'опубликовано'}`); }
      catch (e) { errs.push(`${name}: ${e.message}`); log('ошибка', name, c.title, e.message); }
    }
    const ok = links.length > 0;
    if (ok) { fs.mkdirSync(path.dirname(LAST), { recursive: true }); fs.writeFileSync(LAST, String(Date.now())); }
    await notion.update(c.id, { status: ok ? 'Опубликовано' : 'Переделать', link: (links[0] || '').replace(/^\w+: /, '').startsWith('http') ? links[0].replace(/^\w+: /, '') : undefined, error: errs.join('\n') });
    if (OWNER) await tg.call('sendMessage', { chat_id: OWNER, text: `${ok ? '🚀 Опубликовано' : '⚠️ Не опубликовано'}: «${c.title}»\n${links.join('\n')}${errs.length ? '\n\nОшибки:\n' + errs.join('\n') : ''}` });
    log(ok ? 'опубликовано' : 'не опубликовано', c.title);
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
    const isOwner = msg && String(msg.chat.id) === String(OWNER);
    // обычный /start от подписчика — приветствие и подарок; служебный chat_id видит только владелец (или пока он не задан)
    if (msg?.text === '/start' && !isOwner && /^-?\d+$/.test(String(OWNER || ''))) {
      await tg.call('sendMessage', { chat_id: msg.chat.id, text: 'Здравствуйте! Это бот CRYSTAL FINANCE — кредитного брокера с 8-летним опытом и 50+ банками-партнёрами.\n\nЗдесь можно забрать подарок — чек-лист «12 проверок перед заявкой на кредит».' });
      await gift(msg.chat.id, msg.from.id); continue;
    }
    if (msg?.text && !isOwner && /разбор/i.test(msg.text)) {
      await tg.call('sendMessage', { chat_id: msg.chat.id, text: 'Чтобы разобрать вашу ситуацию, напишите слово РАЗБОР нашему специалисту: @crystalfin54. Консультация бесплатная.' });
      continue;
    }
    if (q && String(q.from.id) === String(OWNER)) {
      const [act, id] = q.data.split(':');
      if (act === 'ok') {
        await notion.update(id, { status: 'Одобрено' });
        await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: AUTO ? 'Одобрено — опубликую по расписанию' : 'Одобрено' });
        if (!AUTO) await tg.call('sendMessage', { chat_id: OWNER, reply_to_message_id: q.message?.message_id,
          text: '✅ Одобрено. Видео/слайды и текст — в сообщениях выше: сохраните и опубликуйте сами.\nПосле публикации нажмите кнопку — SMM не будет повторять тему.',
          reply_markup: { inline_keyboard: [[{ text: '📤 Опубликовал', callback_data: `pub:${id}` }]] } });
      }
      if (act === 'pub') { await notion.update(id, { status: 'Опубликовано' }); await tg.call('answerCallbackQuery', { callback_query_id: q.id, text: 'Отметил как опубликованное' }); }
      if (act === 'no') { waitingEdits.set(String(OWNER), id); await tg.call('sendMessage', { chat_id: OWNER, text: 'Напишите одним сообщением, что поправить — передам SMM.' }); await tg.call('answerCallbackQuery', { callback_query_id: q.id }); }
    } else if (msg && String(msg.chat.id) === String(OWNER) && waitingEdits.has(String(OWNER)) && msg.text) {
      const id = waitingEdits.get(String(OWNER)); waitingEdits.delete(String(OWNER));
      await notion.update(id, { status: 'Переделать', edits: msg.text, preview: false });
      fs.rmSync(path.join(WORK, id), { recursive: true, force: true });
      await tg.call('sendMessage', { chat_id: OWNER, text: 'Принял, отправил на доработку.' });
    } else if (msg?.text === '/start') await tg.call('sendMessage', { chat_id: msg.chat.id, text: `Ваш chat_id: ${msg.chat.id}` });
  }
}

// раздаём картинки карусели для Instagram (он забирает их по ссылке)
if (process.env.PUBLIC_URL) {
  const pub = path.join(__dirname, 'data', 'public'); fs.mkdirSync(pub, { recursive: true });
  require('http').createServer((req, res) => {
    const name = path.basename(decodeURIComponent((req.url || '').split('?')[0]));
    const f = path.join(pub, name);
    if (!/^[\w.-]+\.jpg$/.test(name) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/jpeg' }); fs.createReadStream(f).pipe(res);
  }).listen(Number(process.env.PORT || 8080));
  // убираем картинки старше суток
  setInterval(() => { for (const n of fs.readdirSync(pub)) { const f = path.join(pub, n); if (Date.now() - fs.statSync(f).mtimeMs > 864e5) fs.rmSync(f, { force: true }); } }, 36e5);
}
// продлеваем токен Instagram раз в неделю
if (process.env.IG_TOKEN) setInterval(() => ig.refreshToken().then(() => log('токен Instagram продлён')).catch(e => log(e.message)), 7 * 864e5);

// кнопки проверяем часто, сборку и публикацию — без наложения запусков (рендер идёт несколько минут)
let busy = false, busySince = 0;
// сторож: если сборка висит дольше 20 минут — перезапуск процесса (pm2 поднимет заново), чтобы сервер не «молчал»
setInterval(() => { if (busy && Date.now() - busySince > 20 * 60e3) { log('сборка зависла, перезапуск'); process.exit(1); } }, 60e3);
async function work() {
  if (busy) return; busy = true; busySince = Date.now();
  for (const f of [previews, publish]) { try { await f(); } catch (e) { log(f.name, e.message); } }
  busy = false;
}
let polling = false;
async function poll() { if (polling) return; polling = true; try { await buttons(); } catch (e) { log('buttons', e.message); } polling = false; }
// автообновление: раз в 10 минут подтягиваем код с GitHub; если он изменился — перезапуск (pm2 поднимет снова)
// fetch + reset: обновление не ломается из-за локальных правок на сервере
const { execFile: ex } = require('child_process');
setInterval(() => { if (busy) return; ex('git', ['fetch', '-q', 'origin', 'main'], { cwd: __dirname }, e => {
  if (e) return log('автообновление: ' + e.message.slice(0, 200));
  ex('git', ['rev-parse', 'HEAD', 'origin/main'], { cwd: __dirname }, (e2, out) => {
    const [a, b] = (out || '').trim().split('\n'); if (e2 || !b || a === b) return;
    ex('git', ['reset', '-q', '--hard', 'origin/main'], { cwd: __dirname }, e3 => { if (!e3) { log('обновление кода, перезапуск'); process.exit(0); } });
  });
}); }, 10 * 60 * 1000);
log('Публикатор запущен');
// прошлый запуск упал посреди сборки — сообщаем, чтобы это не было «тишиной»
try { const b = JSON.parse(fs.readFileSync(BUILDING)); fs.rmSync(BUILDING, { force: true });
  notion.update(b.id, { error: 'Сборка прервалась (процесс перезапустился) — повторю' }).catch(() => {});
  if (OWNER) tg.send(OWNER, { text: `⚠️ Сборка «${b.title}» прервалась, пробую снова` }).catch(() => {}); } catch {}
// библиотеку кадров качаем сразу при запуске: ссылки на картинки действуют ограниченное время
require('./lib/library').ensure().then(() => log('библиотека кадров готова')).catch(e => log('library', e.message));
poll(); work();
setInterval(poll, 3000); setInterval(work, 60 * 1000);
