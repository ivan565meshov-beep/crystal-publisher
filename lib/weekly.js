// Итоги недели: по пятницам в 18:00 (Новокузнецк) одно сообщение владельцу — что вышло, сколько заявок и находок
const fs = require('fs'), path = require('path');
const { api } = require('./notion');
const DAYF = path.join(__dirname, '..', 'data', 'weekly_day.txt');
const LOG = path.join(__dirname, '..', 'data', 'site_leads_log.txt');
const FINDS = () => process.env.NOTION_FINDS_DB || '41c6bd0bdf8981e9b478cdec26090032';

async function all(db, filter) {
  const out = []; let cursor;
  do { const j = await api('POST', `/databases/${db}/query`, { page_size: 100, filter, ...(cursor ? { start_cursor: cursor } : {}) });
    out.push(...j.results); cursor = j.has_more ? j.next_cursor : null; } while (cursor);
  return out;
}
async function run(send, owner) {
  const now = new Date(Date.now() + 7 * 3600e3), today = now.toISOString().slice(0, 10);
  if (now.getUTCDay() !== 5 || now.getUTCHours() < 18) return;           // пятница, после 18:00
  try { if (fs.readFileSync(DAYF, 'utf8').trim() === today) return; } catch {}
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const content = await all(process.env.NOTION_CONTENT_DB, { timestamp: 'last_edited_time', last_edited_time: { on_or_after: since } });
  const st = p => p.properties['Статус']?.status?.name, fmt = p => p.properties['Формат']?.select?.name;
  const made = content.filter(p => p.created_time >= since && st(p) !== 'Архив');
  const posted = content.filter(p => ['Одобрено', 'Опубликовано'].includes(st(p)) && fmt(p) !== 'Статья');
  const articles = content.filter(p => fmt(p) === 'Статья' && p.created_time >= since && ['Одобрено', 'Опубликовано'].includes(st(p)));
  let finds = []; try { finds = await all(FINDS(), { timestamp: 'created_time', created_time: { on_or_after: since } }); } catch {}
  const typ = t => finds.filter(p => p.properties['Тип']?.select?.name === t).length;
  const inWork = finds.filter(p => p.properties['Статус']?.select?.name === 'В работе').length;
  let leads = 0; try { leads = fs.readFileSync(LOG, 'utf8').split('\n').filter(l => l && l >= since).length; } catch {}
  const text = `📊 Итоги недели\n\n` +
    `🎬 Контент: подготовлено ${made.filter(p => fmt(p) !== 'Статья').length}, вы выложили ${posted.length}\n` +
    `📰 Статей на сайте за неделю: ${articles.length}\n` +
    `🔔 Заявок с сайта: ${leads}\n` +
    `🤝 Находок: партнёров ${typ('Партнёр')}, клиентов ${typ('Клиент')} (в работе: ${inWork})\n\n` +
    `Метрика сайта: https://metrika.yandex.ru/dashboard?id=114335562`;
  await send(owner, { text });
  fs.mkdirSync(path.dirname(DAYF), { recursive: true }); fs.writeFileSync(DAYF, today);
}
module.exports = { run };
