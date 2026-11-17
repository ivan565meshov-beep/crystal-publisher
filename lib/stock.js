// Живые кадры с людьми: Pixabay (PIXABAY_API_KEY) или Pexels (PEXELS_API_KEY).
// Оба бесплатны, разрешены для рекламы, указывать автора не нужно.
const fs = require('fs'), path = require('path');
const USED = path.join(__dirname, '..', 'data', 'used_stock.json');
const used = () => { try { return new Set(JSON.parse(fs.readFileSync(USED))); } catch { return new Set(); } };
const remember = id => { const s = used(); s.add(id); fs.mkdirSync(path.dirname(USED), { recursive: true }); fs.writeFileSync(USED, JSON.stringify([...s].slice(-3000))); };

// аудитория — Россия: люди в кадре европейской (славянской) внешности, азиатские кадры не берём
const PEOPLE = /\b(wom[ae]n|girls?|lady|ladies|man|men|guy|people|person|couple|family|businesswoman|businessman)\b/i;
const NOT_OURS = /asian|asia|chinese|china|korean|korea|japanese|japan|thai|vietnam|indian|india|african|arab/i;
const localize = q => PEOPLE.test(q) && !/european|russian|slavic|caucasian/i.test(q)
  ? (/(wom[ae]n|girls?|lady|ladies|businesswoman)/i.test(q) ? ['beautiful european ' + q, 'russian ' + q, 'european ' + q] : ['european ' + q, 'caucasian ' + q])
  : [q];

async function pixabaySearch(q) {
  const u = new URL('https://pixabay.com/api/videos/');
  u.search = new URLSearchParams({ key: process.env.PIXABAY_API_KEY, q: q.slice(0, 100), per_page: '30', safesearch: 'true', video_type: 'film' });
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Pixabay ${r.status}`);
  return (await r.json()).hits;
}

async function fromPixabay(query) {
  const seen = used();
  let hits = [];
  for (const q of localize(query)) {
    hits = (await pixabaySearch(q)).filter(h => h.duration >= 4 && !seen.has('pb' + h.id) && !NOT_OURS.test(h.tags || ''));
    if (hits.length) break;
  }
  // вертикальные — в приоритете, потом горизонтальные (обрежем под 9:16)
  hits.sort((a, b) => ((b.videos.medium?.height || 0) > (b.videos.medium?.width || 0)) - ((a.videos.medium?.height || 0) > (a.videos.medium?.width || 0)));
  if (!hits.length) return null;
  const h = hits[Math.floor(Math.random() * Math.min(5, hits.length))];
  const v = h.videos.large?.url ? h.videos.large : h.videos.medium;
  return { id: 'pb' + h.id, link: v.url };
}

async function fromPexels(query) {
  const u = new URL('https://api.pexels.com/videos/search');
  u.search = new URLSearchParams({ query: localize(query)[0], orientation: 'portrait', size: 'medium', per_page: '15' });
  const r = await fetch(u, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const seen = used(), vids = (await r.json()).videos.filter(v => v.duration >= 4 && !seen.has(v.id) && !seen.has('px' + v.id));
  if (!vids.length) return null;
  const v = vids[Math.floor(Math.random() * Math.min(5, vids.length))];
  const file = v.video_files.filter(f => f.file_type === 'video/mp4' && f.height >= 1280 && f.height <= 2160)
    .sort((a, b) => a.height - b.height)[0] || v.video_files[0];
  return { id: 'px' + v.id, link: file.link };
}

async function pick(query, dir, i) {
  const src = process.env.PIXABAY_API_KEY ? fromPixabay : fromPexels;
  const hit = await src(query);
  if (!hit) return null;
  const out = path.join(dir, `broll${String(i).padStart(2, '0')}.mp4`);
  const r = await fetch(hit.link, { headers: { 'User-Agent': 'Mozilla/5.0 (crystal-publisher)' } });
  const buf = Buffer.from(await r.arrayBuffer());
  // защита от «битых» ответов: не видео или слишком маленький файл
  if (!r.ok || buf.length < 100000 || !/video|octet-stream/.test(r.headers.get('content-type') || '')) { remember(hit.id); throw new Error(`не видео (${r.status}, ${buf.length} байт)`); }
  fs.writeFileSync(out, buf);
  remember(hit.id);
  return out;
}

// подставляет broll_file всем битам, у которых есть broll
async function fetchBroll(spec, dir) {
  if (!process.env.PIXABAY_API_KEY && !process.env.PEXELS_API_KEY) return spec;
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < spec.beats.length; i++) {
    const b = spec.beats[i];
    if (b.broll) try { b.broll_file = await pick(b.broll, dir, i); } catch (e) { console.warn('stock:', e.message); }
  }
  return spec;
}
module.exports = { fetchBroll };
