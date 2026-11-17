// Своя библиотека кадров в 3D-стиле бренда (assets/library.json) — вместо случайного стока.
// Картинки скачиваются один раз в data/library; кадр под бит выбирается по смыслу фразы и запроса broll.
const fs = require('fs'), path = require('path');
const LIST = path.join(__dirname, '..', 'assets', 'library.json');
const DIR = path.join(__dirname, '..', 'data', 'library');

const items = () => { try { return JSON.parse(fs.readFileSync(LIST)); } catch { return []; } };
const fileOf = it => path.join(DIR, `${it.id}.png`);

// докачать недостающие картинки (ссылки ElevenLabs живут ограниченное время — качаем сразу после обновления)
async function ensure() {
  fs.mkdirSync(DIR, { recursive: true });
  for (const it of items()) {
    const f = fileOf(it);
    if (fs.existsSync(f) && fs.statSync(f).size > 20000) continue;
    try {
      const r = await fetch(it.url);
      if (!r.ok) throw new Error(String(r.status));
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 20000) fs.writeFileSync(f, b);
    } catch (e) { console.warn('library', it.id, e.message); }
  }
}

const words = s => (s || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter(w => w.length > 2);
// совпадение по началу слова: «отказал» ~ «отказ», «микрозайм» ~ «микрозаймы»
const hit = (a, b) => a.slice(0, 5) === b.slice(0, 5) && Math.min(a.length, b.length) >= 4;

// выбрать кадр для бита; used — уже взятые в этом ролике (не повторяем подряд и по возможности вообще)
function pick(beat, used = new Set(), prev = null) {
  const have = items().filter(it => fs.existsSync(fileOf(it)));
  if (!have.length) return null;
  const q = [...words(beat.broll), ...words(beat.say), ...words(beat.show?.text)];
  const scored = have.map(it => {
    const tags = words(it.tags);
    let s = 0; for (const w of q) if (tags.some(t => hit(w, t))) s++;
    if (used.has(it.id)) s -= 3; if (it.id === prev) s -= 100;
    return { it, s: s + Math.random() * 0.5 };
  }).sort((a, b) => b.s - a.s);
  return scored[0].it;
}

module.exports = { ensure, pick, fileOf, items };
