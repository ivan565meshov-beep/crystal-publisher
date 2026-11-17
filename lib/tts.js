// Озвучка по битам: ElevenLabs (с таймингами слов) или Yandex SpeechKit
const fs = require('fs'), path = require('path');

function wordsFromAlignment(al) {
  const out = []; let w = '', t0 = null, t1 = 0;
  al.characters.forEach((c, i) => {
    if (/\s/.test(c)) { if (w) out.push({ w, t0, t1 }); w = ''; t0 = null; return; }
    if (t0 === null) t0 = al.character_start_times_seconds[i];
    w += c; t1 = al.character_end_times_seconds[i];
  });
  if (w) out.push({ w, t0, t1 });
  return out;
}

async function eleven(beats, dir) {
  const words = [], voice = process.env.ELEVEN_VOICE_ID || 'ws3YyKFd5whKb21yaXES';
  for (let i = 0; i < beats.length; i++) {
    // у персонажей мультфильма свой голос: beat.voice_id
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${beats[i].voice_id || voice}/with-timestamps?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': process.env.ELEVEN_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: beats[i].say, model_id: process.env.ELEVEN_MODEL || 'eleven_multilingual_v2',
        previous_text: beats[i - 1]?.say, next_text: beats[i + 1]?.say,  // для естественной интонации между битами
        voice_settings: { stability: 0.38, similarity_boost: 0.8, style: 0.45, use_speaker_boost: true, speed: 1.08 },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      if (/voice_not_found|not found/i.test(t)) throw new Error(`ElevenLabs: голос ${beats[i].voice_id || voice} не добавлен в My Voices — добавьте его в Voice Library`);
      throw new Error(`ElevenLabs ${r.status}: ${t.slice(0, 200)}`);
    }
    const j = await r.json();
    fs.writeFileSync(path.join(dir, `beat${String(i).padStart(2, '0')}.mp3`), Buffer.from(j.audio_base64, 'base64'));
    words.push(j.alignment ? wordsFromAlignment(j.alignment) : null);
  }
  if (words.every(Boolean)) fs.writeFileSync(path.join(dir, 'words.json'), JSON.stringify(words));
}

async function yandex(beats, dir) {
  for (let i = 0; i < beats.length; i++) {
    const body = new URLSearchParams({ text: beats[i].say, lang: 'ru-RU', voice: process.env.YANDEX_VOICE || 'filipp', format: 'mp3', speed: '1.1' });
    if (process.env.YANDEX_FOLDER_ID) body.set('folderId', process.env.YANDEX_FOLDER_ID);
    const r = await fetch('https://tts.api.cloud.yandex.net/speech/v1/tts:synthesize', { method: 'POST', headers: { Authorization: `Api-Key ${process.env.YANDEX_API_KEY}` }, body });
    if (!r.ok) throw new Error(`Yandex TTS ${r.status}: ${await r.text()}`);
    fs.writeFileSync(path.join(dir, `beat${String(i).padStart(2, '0')}.mp3`), Buffer.from(await r.arrayBuffer()));
  }
}

async function voiceover(beats, dir) {
  fs.mkdirSync(dir, { recursive: true });
  if (process.env.ELEVEN_API_KEY) { await eleven(beats, dir); return dir; }
  if (process.env.YANDEX_API_KEY) { await yandex(beats, dir); return dir; }
  return null; // без ключей — рилс без голоса
}
module.exports = { voiceover };
