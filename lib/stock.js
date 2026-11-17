// Живые кадры с людьми: Pixabay (PIXABAY_API_KEY) или Pexels (PEXELS_API_KEY).
// Оба бесплатны, разрешены для рекламы, указывать автора не нужно.
const fs = require('fs'), path = require('path');
const USED = path.join(__dirname, '..', 'data', 'used_stock.json');
const used = () => { try { return new Set(JSON.parse(fs.readFileSync(USED))); } catch { return new Set(); } };
const remember = id => { const s = used(); s.add(id); fs.mkdirSync(path.dirname(USED), { recursive: true }); fs.writeFileSync(USED, JSON.stringify([...s].slice(-3000))); };

async function fromPixabay(query) {
  const u = new URL('https://pixabay.com/api/videos/');
  u.search = new URLSearchParams({ key: process.env.PIXABAY_API_KEY, q: query.slice(0, 100), per_page: '20', safesearch: 'true', video_type: 'film' });
  const r = await fetch(u);
  if (!r.ok) throw new Error(`Pixabay ${r.status}`);
  const seen = used();
  const hits = (await r.json()).hits.filter(h => h.duration >= 4 && !seen.has('pb' + h.id));
  // вертикальные — в приоритете, потом горизонтальные (обрежем под 9:16)
  hits.sort((a, b) => ((b.videos.medium?.height || 0) > (b.videos.medium?.width || 0)) - ((a.videos.medium?.height || 0) > (a.videos.medium?.width || 0)));
  if (!hits.length) return null;
  const h = hits[Math.floor(Math.random() * Math.min(5, hits.length))];
  const v = h.videos.large?.url ? h.videos.large : h.videos.medium;
  return { id: 'pb' + h.id, link: v.url };
}

async function fromPexels(query) {
  const u = new URL('https://api.pexels.com/videos/search');
  u.search = new URLSearchParams({ query, orientation: 'portrait', size: 'medium', per_page: '15' });
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
  fs.writeFileSync(out, Buffer.from(await (await fetch(hit.link)).arrayBuffer()));
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
