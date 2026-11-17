// Instagram (API с входом через Instagram): рилсы и карусели
// .env: IG_TOKEN (долгоживущий токен), IG_USER_ID, PUBLIC_URL (http://IP:8080 — для картинок карусели)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const V = process.env.IG_API_VERSION || 'v21.0';
const G = `https://graph.instagram.com/${V}`;
const tok = () => process.env.IG_TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, url, params = {}) {
  const u = new URL(G + url);
  const opt = { method };
  if (method === 'GET') { for (const [k, v] of Object.entries({ ...params, access_token: tok() })) u.searchParams.set(k, v); }
  else opt.body = new URLSearchParams({ ...params, access_token: tok() });
  const j = await (await fetch(u, opt)).json();
  if (j.error) throw new Error(`Instagram: ${j.error.message}`);
  return j;
}
async function waitReady(id) {
  for (let i = 0; i < 60; i++) {
    const s = await api('GET', `/${id}`, { fields: 'status_code' });
    if (s.status_code === 'FINISHED') return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error('Instagram не принял файл: ' + s.status_code);
    await sleep(5000);
  }
  throw new Error('Instagram слишком долго обрабатывает файл');
}
// подпись: без кликабельных ссылок, не длиннее 2200 знаков
const caption = t => (t || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/https?:\/\/\S+/g, 'ссылка в профиле').slice(0, 2150);

// рилс — загрузка файла напрямую (публичная ссылка не нужна)
async function reel(video, text) {
  const uid = process.env.IG_USER_ID;
  const c = await api('POST', `/${uid}/media`, { media_type: 'REELS', upload_type: 'resumable', caption: caption(text), share_to_feed: 'true' });
  const size = fs.statSync(video).size;
  const r = await fetch(c.uri || `https://rupload.facebook.com/ig-api-upload/${V}/${c.id}`, {
    method: 'POST', headers: { Authorization: `OAuth ${tok()}`, offset: '0', file_size: String(size) }, body: fs.readFileSync(video),
  });
  if (!r.ok) throw new Error('Instagram загрузка видео: ' + (await r.text()));
  await waitReady(c.id);
  return publish(c.id);
}

// карусель — Instagram скачивает JPEG по публичной ссылке с нашего сервера
async function carousel(photos, text) {
  const uid = process.env.IG_USER_ID, base = process.env.PUBLIC_URL;
  if (!base) throw new Error('Для карусели в Instagram укажите PUBLIC_URL в .env');
  const pub = path.join(__dirname, '..', 'data', 'public'); fs.mkdirSync(pub, { recursive: true });
  const kids = [];
  for (const p of photos.slice(0, 10)) {
    const name = `${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', p, '-q:v', '2', path.join(pub, name)]);
    const k = await api('POST', `/${uid}/media`, { image_url: `${base}/public/${name}`, is_carousel_item: 'true' });
    kids.push(k.id);
  }
  for (const k of kids) await waitReady(k);
  const c = await api('POST', `/${uid}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: caption(text) });
  await waitReady(c.id);
  return publish(c.id);
}

async function publish(creationId) {
  const p = await api('POST', `/${process.env.IG_USER_ID}/media_publish`, { creation_id: creationId });
  const m = await api('GET', `/${p.id}`, { fields: 'permalink' }).catch(() => ({}));
  return m.permalink || null;
}

async function post({ text, photos, video }) {
  if (video) return reel(video, text);
  if (photos?.length) return carousel(photos, text);
  throw new Error('Instagram не публикует посты без картинки или видео');
}

// долгоживущий токен живёт 60 дней — продлеваем раз в неделю и сохраняем в .env
async function refreshToken() {
  const j = await (await fetch(`https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token=${tok()}`)).json();
  if (!j.access_token) throw new Error('Instagram токен не продлился: ' + JSON.stringify(j.error || j));
  process.env.IG_TOKEN = j.access_token;
  const envF = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envF)) fs.writeFileSync(envF, fs.readFileSync(envF, 'utf8').replace(/^IG_TOKEN=.*$/m, `IG_TOKEN=${j.access_token}`));
}
module.exports = { post, refreshToken };
