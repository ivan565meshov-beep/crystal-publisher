// Сборка мультсерии из готовых 3D-клипов ElevenLabs (герои уже говорят своими голосами).
// spec: {type:"cartoon", clips:[url, ...], cta:{say, line1, accent, keyword}, note?}
// Клипы приводятся к 1080×1920, склеиваются, в конце — фирменная карточка с призывом (голос диктора),
// внизу мелкая плашка «Персонажи и сюжет вымышлены», под всем — тихая музыка.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFile, execFileSync } = require('child_process');
const { voiceover } = require('./lib/tts');
const { film } = require('./film');
const ff = a => new Promise((res, rej) => execFile('ffmpeg', ['-y', '-v', 'error', ...a], { maxBuffer: 1 << 26 }, (e, o, err) => e ? rej(new Error('ffmpeg: ' + (err || e.message).toString().slice(0, 300))) : res()));
const dur = f => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const FONT = ['/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', '/usr/share/fonts/opentype/inter/Inter-Bold.otf'].find(f => fs.existsSync(f));

async function download(url, out) {
  const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) throw new Error(`клип не скачался (${r.status}) — ссылка могла устареть`);
  fs.writeFileSync(out, Buffer.from(await r.arrayBuffer()));
}

async function cartoon(spec, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cartoon'));
  const parts = [];
  // 1) клипы → единый формат
  for (let i = 0; i < spec.clips.length; i++) {
    const raw = path.join(tmp, `raw${i}.mp4`), norm = path.join(tmp, `p${i}.mp4`);
    await download(spec.clips[i], raw);
    // субтитры: мелко внизу, реплика клипа (spec.subs[i]); теги эмоций [..] убираем, длинные строки переносим
    let sub = '';
    const line = (spec.subs?.[i] || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
    if (line && FONT) {
      const tf = path.join(tmp, `sub${i}.txt`), out = []; let cur = '';
      for (const w of line.split(' ')) { if ((cur + ' ' + w).trim().length > 30) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; }
      if (cur.trim()) out.push(cur.trim());
      fs.writeFileSync(tf, out.join('\n'));
      sub = `,drawtext=fontfile=${FONT}:textfile=${tf}:fontcolor=white:fontsize=40:line_spacing=8:borderw=3:bordercolor=black@0.85:box=1:boxcolor=black@0.35:boxborderw=14:x=(w-tw)/2:y=h-th-170`;
    }
    await ff(['-i', raw, '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30,setsar=1' + sub,
      '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100,aformat=channel_layouts=stereo', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', norm]);
    parts.push(norm);
  }
  // 2) финальная карточка с призывом — нашим движком рилсов, голосом диктора
  if (spec.cta) {
    const c = { type: 'reel', handle: spec.cta.handle || 'в директ', beats: [{ say: spec.cta.say, fx: 'punch flash', show: { kind: 'cta', line1: spec.cta.line1, accent: spec.cta.accent, keyword: spec.cta.keyword, handle: spec.cta.handle || 'в директ' } }] };
    const vd = await voiceover(c.beats, path.join(tmp, 'ctavoice'));
    const raw = path.join(tmp, 'cta_raw.mp4'), norm = path.join(tmp, 'cta.mp4');
    await film(c, raw, vd);
    await ff(['-i', raw, '-vf', 'fps=30,setsar=1', '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=44100,aformat=channel_layouts=stereo', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', norm]);
    parts.push(norm);
  }
  // 3) склейка
  const n = parts.length, joined = path.join(tmp, 'joined.mp4');
  await ff([...parts.flatMap(p => ['-i', p]), '-filter_complex', parts.map((_, i) => `[${i}:v][${i}:a]`).join('') + `concat=n=${n}:v=1:a=1[v][a]`,
    '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', joined]);
  // 4) плашка + тихая музыка с приглушением под голос
  const total = dur(joined), out = path.join(dir, 'cartoon.mp4');
  const note = (spec.note || 'Персонажи и сюжет вымышлены').replace(/[:'\\]/g, '');
  const vf = FONT ? `drawtext=fontfile=${FONT}:text='${note}':fontcolor=white@0.55:fontsize=30:x=(w-tw)/2:y=h-90` : 'null';
  const tracks = [path.join(__dirname, 'assets', 'music'), path.join(__dirname, 'data', 'music')]
    .flatMap(d => fs.existsSync(d) ? fs.readdirSync(d).filter(f => /\.(mp3|wav|m4a)$/i.test(f)).map(f => path.join(d, f)) : []);
  const music = tracks.find(t => /drama/i.test(t)) || tracks[0];
  const args = ['-i', joined];
  // реплики разных героев — разной громкости: выравниваем (speechnorm), музыка — ровная тихая подложка
  const VN = 'anull'; // каждый клип уже выровнен loudnorm
  let af = `[0:a]${VN},alimiter=limit=0.95[a]`;
  if (music) {
    args.push('-stream_loop', '-1', '-i', music);
    af = `[0:a]${VN}[v1];[1:a]volume=${process.env.MUSIC_VOL || 0.07},afade=t=in:d=0.5,afade=t=out:st=${Math.max(0, total - 1.2).toFixed(2)}:d=1.2[mu];` +
      `[v1][mu]amix=inputs=2:normalize=0,alimiter=limit=0.95[a]`;
  }
  await ff([...args, '-filter_complex', `[0:v]${vf}[v];${af}`, '-map', '[v]', '-map', '[a]', '-t', total.toFixed(2),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out]);
  fs.rmSync(tmp, { recursive: true, force: true });
  return out;
}
module.exports = { cartoon };
if (require.main === module) {
  require('./lib/env');
  const [specF, outDir] = process.argv.slice(2);
  cartoon(JSON.parse(fs.readFileSync(specF)), outDir || 'data/test_cartoon').then(f => console.log('готово:', f)).catch(e => { console.error(e.message); process.exit(1); });
}
