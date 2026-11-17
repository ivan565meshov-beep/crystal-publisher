// Живые кадры с людьми из Pexels (бесплатно, разрешено для рекламы, без указания автора)
const fs = require('fs'), path = require('path');
const USED = path.join(__dirname, '..', 'data', 'used_stock.json');
const used = () => { try { return new Set(JSON.parse(fs.readFileSync(USED))); } catch { return new Set(); } };

async function pick(query, dir, i) {
  const u = new URL('https://api.pexels.com/videos/search');
  u.search = new URLSearchParams({ query, orientation: 'portrait', size: 'medium', per_page: '15' });
  const r = await fetch(u, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  const seen = used(), vids = (await r.json()).videos.filter(v => v.duration >= 4 && !seen.has(v.id));
  if (!vids.length) return null;
  const v = vids[Math.floor(Math.random() * Math.min(5, vids.length))];
  const file = v.video_files.filter(f => f.file_type === 'video/mp4' && f.height >= 1280 && f.height <= 2160)
    .sort((a, b) => a.height - b.height)[0] || v.video_files[0];
  const out = path.join(dir, `broll${String(i).padStart(2, '0')}.mp4`);
  fs.writeFileSync(out, Buffer.from(await (await fetch(file.link)).arrayBuffer()));
  seen.add(v.id); fs.mkdirSync(path.dirname(USED), { recursive: true }); fs.writeFileSync(USED, JSON.stringify([...seen].slice(-3000)));
  return out;
}
// подставляет broll_file всем битам, у которых есть broll
async function fetchBroll(spec, dir) {
  if (!process.env.PEXELS_API_KEY) return spec;
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < spec.beats.length; i++) {
    const b = spec.beats[i];
    if (b.broll) try { b.broll_file = await pick(b.broll, dir, i); } catch (e) { console.warn('stock:', e.message); }
  }
  return spec;
}
module.exports = { fetchBroll };
