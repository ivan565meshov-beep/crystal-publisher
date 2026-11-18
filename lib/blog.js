// Нейроблог: статьи из Notion («📣 Контент», Формат = Статья, Площадка = Сайт, Статус = Одобрено/Опубликовано)
// превращаются в страницы сайта crystalfinance.ru/blog/… и отправляются на сервер сайта в России
// (оттуда Notion недоступен, поэтому сборка идёт здесь, а на сайт уходят готовые HTML-файлы).
const fs = require('fs'), path = require('path'), crypto = require('crypto'), zlib = require('zlib');
const { api, txt } = require('./notion');
const SITE = 'https://crystalfinance.ru';
const STATE = path.join(__dirname, '..', 'data', 'blog_hash.txt');

const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TR = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };
const slugify = s => s.toLowerCase().split('').map(c => TR[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'statya';

// rich text Notion → HTML (жирный, курсив, ссылки)
const rt = arr => (arr || []).map(t => {
  let s = esc(t.plain_text);
  if (t.annotations?.bold) s = `<b>${s}</b>`;
  if (t.annotations?.italic) s = `<i>${s}</i>`;
  if (t.href) s = `<a href="${esc(t.href)}"${/^https?:\/\/crystalfinance\.ru/.test(t.href) ? '' : ' target="_blank" rel="noopener"'}>${s}</a>`;
  return s;
}).join('');

async function blocks(id) {
  const out = []; let cursor;
  do {
    const j = await api('GET', `/blocks/${id}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
    out.push(...j.results); cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  return out;
}
function toHtml(bs) {
  let h = '', list = null;
  const close = () => { if (list) { h += `</${list}>`; list = null; } };
  for (const b of bs) {
    const d = b[b.type] || {};
    if (b.type === 'bulleted_list_item' || b.type === 'numbered_list_item') {
      const tag = b.type === 'bulleted_list_item' ? 'ul' : 'ol';
      if (list !== tag) { close(); h += `<${tag}>`; list = tag; }
      h += `<li>${rt(d.rich_text)}</li>`; continue;
    }
    close();
    if (b.type === 'paragraph') { const s = rt(d.rich_text); if (s) h += `<p>${s}</p>`; }
    else if (b.type === 'heading_1' || b.type === 'heading_2') h += `<h2>${rt(d.rich_text)}</h2>`;
    else if (b.type === 'heading_3') h += `<h3>${rt(d.rich_text)}</h3>`;
    else if (b.type === 'quote' || b.type === 'callout') h += `<p class="box">${rt(d.rich_text)}</p>`;
    else if (b.type === 'divider') h += '<hr>';
  }
  close(); return h;
}

// шапка и подвал берём со страницы сайта, чтобы блог выглядел как весь сайт
function shell() {
  const s = fs.readFileSync(path.join(__dirname, '..', 'site', 'kontakty.html'), 'utf8');
  const head = s.slice(0, s.indexOf('<main id="main">')), tail = s.slice(s.indexOf('</main>') + 7);
  const fix = x => x.replace(/(href|src)="(?!https?:|#|mailto:|tel:|\/)([^"]+)"/g, '$1="/$2"').replace(/ aria-current="page"/g, '');
  return { head: fix(head), tail: fix(tail) };
}
function page(sh, { title, desc, url, body, date }) {
  let head = sh.head
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)} — CRYSTAL FINANCE</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${esc(desc)}">`)
    .replace(/<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${url}">`)
    .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${esc(title)}">`)
    .replace(/<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${esc(desc)}">`)
    .replace(/<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${url}">`);
  if (date) head = head.replace('</head>', `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: title, description: desc, datePublished: date, author: { '@type': 'Organization', name: 'CRYSTAL FINANCE' }, publisher: { '@type': 'Organization', name: 'CRYSTAL FINANCE' }, mainEntityOfPage: url })}</script>\n</head>`);
  return head + `<main id="main">${body}</main>` + sh.tail;
}

async function build() {
  const j = await api('POST', `/databases/${process.env.NOTION_CONTENT_DB}/query`, { page_size: 100, filter: { and: [
    { property: 'Формат', select: { equals: 'Статья' } },
    { property: 'Площадка', multi_select: { contains: 'Сайт' } },
    { or: [{ property: 'Статус', status: { equals: 'Одобрено' } }, { property: 'Статус', status: { equals: 'Опубликовано' } }] }] } });
  const sh = shell(), files = {}, items = [];
  for (const pg of j.results) {
    const P = pg.properties, title = txt(P['Пост']); if (!title) continue;
    const slug = slugify(title), url = `${SITE}/blog/${slug}`;
    const date = (P['Дата публикации']?.date?.start || pg.created_time).slice(0, 10);
    const desc = txt(P['Текст']).replace(/\s+/g, ' ').slice(0, 200);
    const html = toHtml(await blocks(pg.id));
    const body = `<section class="phero" style="padding-bottom:24px"><div class="wrap"><div class="crumbs"><a href="/index.html">Главная</a><span>/</span><a href="/blog/">Блог</a></div><h1 class="h1" style="font-size:clamp(30px,4.6vw,56px)">${esc(title)}</h1><p class="lead" style="margin-top:16px">${esc(desc)}</p></div></section>
<section class="sec-tight" style="padding-top:24px"><div class="wrap"><article class="legal">${html}
<p class="box">Хотите разобрать свою ситуацию? <a href="/#zayavka">Оставьте заявку</a> — консультация бесплатная. CRYSTAL FINANCE не является банком; решение о выдаче кредита принимает банк.</p></article></div></section>`;
    files[`${slug}.html`] = page(sh, { title, desc, url, body, date });
    items.push({ title, desc, slug, date, id: pg.id, status: P['Статус']?.status?.name, link: P['Ссылка']?.url });
  }
  items.sort((a, b) => b.date.localeCompare(a.date));
  const list = items.map(i => `<a class="card panel" href="/blog/${i.slug}" style="display:block;margin-bottom:16px"><small style="color:var(--muted)">${i.date.split('-').reverse().join('.')}</small><h3 style="margin:8px 0">${esc(i.title)}</h3><p>${esc(i.desc)}</p></a>`).join('') || '<p>Статьи скоро появятся.</p>';
  files['index.html'] = page(sh, { title: 'Блог о кредитах и кредитной истории', desc: 'Разборы от кредитного брокера CRYSTAL FINANCE: почему банки отказывают, как улучшить кредитную историю, кредитные каникулы и рефинансирование.', url: `${SITE}/blog/`,
    body: `<section class="phero" style="padding-bottom:24px"><div class="wrap"><div class="crumbs"><a href="/index.html">Главная</a><span>/</span><span>Блог</span></div><h1 class="h1" style="font-size:clamp(34px,5vw,64px)">Блог</h1><p class="lead" style="margin-top:16px">Разбираем, почему банки отказывают и как получить одобрение.</p></div></section><section class="sec-tight"><div class="wrap">${list}</div></section>` });
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/blog/</loc></url>\n` +
    items.map(i => `  <url><loc>${SITE}/blog/${i.slug}</loc><lastmod>${i.date}</lastmod></url>`).join('\n') + '\n</urlset>\n';
  return { files, items };
}

// собрать и, если что-то изменилось, отправить на сервер сайта; одобренные статьи → «Опубликовано» со ссылкой
async function sync(log) {
  const K = process.env.SITE_PULL_KEY; if (!K || !process.env.NOTION_TOKEN) return;
  const { files, items } = await build();
  const hash = crypto.createHash('sha1').update(JSON.stringify(files)).digest('hex');
  let old = ''; try { old = fs.readFileSync(STATE, 'utf8'); } catch {}
  if (hash !== old) {
    const base = (process.env.SITE_URL || SITE) + '/api/blog-sync';
    const post = async (q, body) => {   // по одному файлу и в gzip: у сайта лимит 32 КБ на запрос
      const r = await fetch(base + q, { method: 'POST', headers: { 'X-Key': K, 'Content-Type': 'application/octet-stream' }, body, signal: AbortSignal.timeout(30000) });
      if (!r.ok) throw new Error('сайт ответил ' + r.status + ' ' + (await r.text()).slice(0, 100));
    };
    await post('?start=1', '');
    for (const [n, c] of Object.entries(files)) await post('?f=' + n, zlib.gzipSync(c));
    await post('?commit=1', '');
    fs.mkdirSync(path.dirname(STATE), { recursive: true }); fs.writeFileSync(STATE, hash);
    log && log('блог обновлён на сайте:', items.length, 'статей');
  }
  for (const i of items) if (i.status === 'Одобрено' || !i.link)
    await api('PATCH', `/pages/${i.id}`, { properties: { 'Статус': { status: { name: 'Опубликовано' } }, 'Ссылка': { url: `${SITE}/blog/${i.slug}` } } });
}
module.exports = { sync, build, slugify };
