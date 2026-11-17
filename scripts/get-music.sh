#!/bin/bash
# Скачивает фоновую музыку (сгенерирована в ElevenLabs) в data/music
cd "$(dirname "$0")/.." && mkdir -p data/music
B='https://elevenlabsusercontent.com/database/workspace/6042cc4b3bd24a358c9da769286f5f29/content_generation'
curl -sLo data/music/lofi1.mp3 "$B/tqycBgUWuUfYk721uURi/tyzvm1ZcxLWbxe8LnNtK/content.mp3?Expires=1794924000&KeyName=assets-cdn-key-1&Signature=ngphEabdUThogG4WfCU-dL_gIjc="
curl -sLo data/music/lofi2.mp3 "$B/pCn3hZ0J3lxKOzgFwqaY/PXFW8G6307cWU9rzl05j/content.mp3?Expires=1794924000&KeyName=assets-cdn-key-1&Signature=Tesgyr3DPNGCBycYENyg5Ix8C5k="
curl -sLo data/music/drama1.mp3 "$B/G6jp6Uo51WOH7zNJy132/E8CAG5mFCaVvMrNc7Xq6/content.mp3?Expires=1794924000&KeyName=assets-cdn-key-1&Signature=3tfuXjODw0r69b3niwtS2jE00wg="
# битые (не mp3) удаляем
for f in data/music/*.mp3; do [ "$(stat -c%s "$f")" -lt 100000 ] && rm -f "$f"; done
ls -la data/music
