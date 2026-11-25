// Работа с базой «📣 Контент» в Notion
const H = () => ({ Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' });
const api = async (method, url, body) => {
  const r = await fetch('https://api.notion.com/v1' + url, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json(); if (!r.ok) throw new Error(`Notion ${r.status}: ${j.message}`); return j;
};
const txt = p => (p?.rich_text || p?.title || []).map(t => t.plain_text).join('');

async function query(status) {
  const j = await api('POST', `/databases/${process.env.NOTION_CONTENT_DB}/query`, { filter: { property: 'Статус', status: { equals: status } }, page_size: 50 });
  return j.results.map(pg => {
    const P = pg.properties;
    return {
      id: pg.id, url: pg.url, title: txt(P['Пост']), text: txt(P['Текст']), format: P['Формат']?.select?.name || 'Пост',
      platforms: (P['Площадка']?.multi_select || []).map(x => x.name), date: P['Дата публикации']?.date?.start || null,
      preview: P['Превью отправлено']?.checkbox || false,
      series: txt(P['Серия']),
    };
  });
}
// Сценарий (JSON) лежит в блоке кода на странице карточки
async function spec(pageId) {
  let cursor, code = '';
  do {
    const j = await api('GET', `/blocks/${pageId}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
    for (const b of j.results) if (b.type === 'code') code += b.code.rich_text.map(t => t.plain_text).join('');
    cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return code.trim() ? JSON.parse(code) : null;
}
async function update(pageId, { status, link, error, edits, preview }) {
  const p = {};
  if (status) p['Статус'] = { status: { name: status } };
  if (link) p['Ссылка'] = { url: link };
  if (error !== undefined) p['Ошибка'] = { rich_text: error ? [{ text: { content: String(error).slice(0, 1900) } }] : [] };
  if (edits) p['Правки'] = { rich_text: [{ text: { content: edits.slice(0, 1900) } }] };
  if (preview !== undefined) p['Превью отправлено'] = { checkbox: preview };
  return api('PATCH', `/pages/${pageId}`, { properties: p });
}
module.exports = { query, spec, update, api, txt };
