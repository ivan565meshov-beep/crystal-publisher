// Сборка рилса: node film.js spec.json out.mp4 [voiceDir]
// spec.beats[i].broll_file — путь к скачанному стоковому видео (подкладывается фоном под графику)
// voiceDir — beat00.mp3, beat01.mp3 … (озвучка по битам) и words.json (тайминги слов, необязательно)
const { chromium } = require('playwright');
const { execFileSync, execFile } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const T = path.join(__dirname, 'templates'), FPS = 30;
// ffmpeg запускаем асинхронно, чтобы бот отвечал, пока идёт склейка видео
const ff = a => new Promise((res, rej) => execFile('ffmpeg', ['-y', '-v', 'error', ...a], { maxBuffer: 1 << 26 }, (e, o, err) => e ? rej(new Error('ffmpeg: ' + (err || e.message).toString().slice(0, 300))) : res()));
const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// звуковые акценты синтезируем сами — без чужой музыки и лицензий
async function sfx(dir) {
  const w = path.join(dir, 'whoosh.wav'), h = path.join(dir, 'hit.wav');
  await ff(['-f', 'lavfi', '-i', 'anoisesrc=d=0.35:c=pink:a=0.6', '-af', 'highpass=f=600,lowpass=f=5000,afade=t=in:d=0.18,afade=t=out:st=0.18:d=0.17,volume=0.7', w]);
  await ff(['-f', 'lavfi', '-i', "aevalsrc='0.9*sin(2*PI*(55+90*exp(-25*t))*t)*exp(-9*t)':d=0.5", '-af', 'volume=1.2', h]);
  return { whoosh: w, hit: h };
}

// фоновый бит ~120 BPM: бочка, хэты и мягкий аккорд — синтезируем сами, без лицензий
async function beat(dir, seconds) {
  const out = path.join(dir, 'beat.wav'), d = (seconds + 0.5).toFixed(2);
  const kick = `aevalsrc='0.8*sin(2*PI*(45+110*exp(-35*mod(t,0.5)))*t)*exp(-9*mod(t,0.5))':d=${d}`;
  const pad = `aevalsrc='0.05*(sin(2*PI*220*t)+sin(2*PI*261.63*t)+sin(2*PI*329.63*t))*(0.7+0.3*sin(2*PI*0.25*t))':d=${d}`;
  await ff(['-f', 'lavfi', '-i', kick, '-f', 'lavfi', '-i', `anoisesrc=d=${d}:c=white:a=0.5`, '-f', 'lavfi', '-i', pad,
    '-filter_complex', `[1:a]highpass=f=7000,volume='0.35*exp(-60*mod(t+0.25,0.25))':eval=frame[h];[2:a]lowpass=f=1800[p];[0:a][h][p]amix=inputs=3:normalize=0,afade=t=in:d=0.3,afade=t=out:st=${(seconds - 0.8).toFixed(2)}:d=0.8,volume=0.5[o]`,
    '-map', '[o]', '-ar', '44100', out]);
  return out;
}

// фон бита: стоковое видео 9:16 с наездом камеры и фирменной цветокоррекцией, либо фирменный цвет
async function baseSegment(beat, d, out) {
  const n = Math.ceil(d * FPS);
  if (beat.broll_file && fs.existsSync(beat.broll_file)) try {
    const z = `zoompan=z='1.14-0.14*min(on/7\\,1)+0.0016*on':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=${FPS}`;
    await ff(['-stream_loop', '-1', '-ss', String(beat.broll_start || 0.4), '-i', beat.broll_file, '-frames:v', String(n),
      '-vf', `scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${z},eq=saturation=0.86:contrast=1.06,colorbalance=bs=0.06:bm=0.03,setsar=1`,
      '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', out]);
    return;
  } catch (e) { console.warn('кадр пропущен, ставлю фон:', e.message.slice(0, 120)); }
  {
    await ff(['-f', 'lavfi', '-i', `color=c=0x14171c:s=1080x1920:r=${FPS}`, '-frames:v', String(n), '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', out]);
  }
}

async function film(spec, out, voiceDir) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'reel'));
  let DUR = null, WORDS = null, voice = [];
  if (voiceDir) {
    voice = spec.beats.map((_, i) => path.join(voiceDir, `beat${String(i).padStart(2, '0')}.mp3`));
    if (voice.every(f => fs.existsSync(f))) DUR = voice.map(f => dur(f) + 0.22); else voice = [];
    const wj = path.join(voiceDir, 'words.json'); if (fs.existsSync(wj)) WORDS = JSON.parse(fs.readFileSync(wj));
  }
  // 1) графический слой с прозрачностью; браузер перезапускаем каждые CHUNK кадров, чтобы не копилась память
  const CHUNK = 300;
  const open = async () => {
    const b = await chromium.launch({ args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-zygote'] });
    const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
    await p.addInitScript(([s, d, w]) => { window.SPEC = s; if (d) window.DUR = d; if (w) window.WORDS = w; }, [spec, DUR, WORDS]);
    await p.goto('file://' + path.join(T, 'reel.html'));
    await p.evaluate(() => document.fonts.ready);
    return { b, p };
  };
  let { b, p } = await open();
  const total = await p.evaluate(() => total()), starts = await p.evaluate(() => beatStarts()), D = await p.evaluate(() => DUR);
  const n = Math.round(total * FPS);
  for (let i = 0; i < n; i++) {
    if (i && i % CHUNK === 0) { await b.close(); ({ b, p } = await open()); }
    await p.evaluate(t => render(t), i / FPS);
    await p.screenshot({ path: `${tmp}/f${String(i).padStart(5, '0')}.png`, omitBackground: true });
  }
  await b.close();
  // 2) фон: по сегменту на бит, точно по кадрам
  const list = [];
  for (let i = 0; i < spec.beats.length; i++) {
    const bt = spec.beats[i];
    const f0 = Math.round(starts[i] * FPS), f1 = i + 1 < starts.length ? Math.round(starts[i + 1] * FPS) : n;
    const seg = path.join(tmp, `seg${i}.mp4`); await baseSegment(bt, (f1 - f0) / FPS, seg); list.push(`file '${seg}'`);
  }
  fs.writeFileSync(path.join(tmp, 'list.txt'), list.join('\n'));
  await ff(['-f', 'concat', '-safe', '0', '-i', path.join(tmp, 'list.txt'), '-c', 'copy', path.join(tmp, 'base.mp4')]);
  // 3) звук: озвучка + вжухи/удары на сменах кадра
  const fx = await sfx(tmp), ins = [], parts = [];
  spec.beats.forEach((bt, i) => {
    const ms = Math.round(starts[i] * 1000), f = bt.fx || '';
    if (voice.length) { ins.push('-i', voice[i]); parts.push({ i: ins.length / 2 - 1, ms, vol: 1 }); }
    if (/whip/.test(f)) { ins.push('-i', fx.whoosh); parts.push({ i: ins.length / 2 - 1, ms: Math.max(0, ms - 120), vol: .45 }); }
    if (/punch|shake/.test(f)) { ins.push('-i', fx.hit); parts.push({ i: ins.length / 2 - 1, ms, vol: .6 }); }
  });
  // музыка: только живые треки из data/music (mp3/wav), синтезированный бит убран — он «пикал».
  // Нет треков — ролик идёт без музыки. Под голосом музыка автоматически приглушается.
  const tracks = [path.join(__dirname, 'assets', 'music'), path.join(__dirname, 'data', 'music')]
    .flatMap(d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.(mp3|wav|m4a)$/i.test(f)).map(f => path.join(d, f)) : []);
  let mi = -1;
  if (tracks.length) {
    const t = tracks[Math.floor(Math.random() * tracks.length)];
    ins.push('-stream_loop', '-1', '-i', t); mi = (ins.filter(x => x === '-i').length) - 1;
  }
  const mix = parts.map((q, k) => `[${q.i + 2}:a]volume=${q.vol},adelay=${q.ms}|${q.ms}[a${k}]`).join(';') +
    `;${parts.map((_, k) => `[a${k}]`).join('')}amix=inputs=${parts.length}:normalize=0[fg]`;
  const fade = `afade=t=in:d=0.4,afade=t=out:st=${Math.max(0, n / FPS - 1).toFixed(2)}:d=1`;
  const a = mi < 0
    ? `${mix};[fg]alimiter=limit=0.95[aout]`
    : voice.length
    ? `${mix};[fg]asplit=2[fg1][sc];[${mi + 2}:a]volume=0.35,${fade}[mu];[mu][sc]sidechaincompress=threshold=0.02:ratio=8:attack=5:release=400[duck];[fg1][duck]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]`
    : `${mix};[${mi + 2}:a]volume=0.9,${fade}[mu];[fg][mu]amix=inputs=2:normalize=0,alimiter=limit=0.95[aout]`;
  await ff(['-i', path.join(tmp, 'base.mp4'), '-framerate', String(FPS), '-i', `${tmp}/f%05d.png`, ...ins,
    '-filter_complex', `[0:v][1:v]overlay=0:0:shortest=1[vout];${a}`, '-map', '[vout]', '-map', '[aout]',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k',
    '-t', String(n / FPS), '-movflags', '+faststart', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return { frames: n, seconds: n / FPS, durations: D };
}
module.exports = { film };
if (require.main === module) {
  const [specF, out, vd] = process.argv.slice(2);
  film(JSON.parse(fs.readFileSync(specF)), out, vd).then(r => console.log(`${r.frames} кадров, ${r.seconds.toFixed(1)} c -> ${out}`));
}
