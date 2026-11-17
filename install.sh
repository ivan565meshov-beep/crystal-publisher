#!/usr/bin/env bash
# Установка публикатора CRYSTAL FINANCE на чистый Ubuntu 22.04/24.04
# Запуск: bash install.sh   (из папки с публикатором)
set -e
cd "$(dirname "$0")"
echo "== 1/5 Системные пакеты"
sudo apt-get update -y
sudo apt-get install -y ffmpeg fonts-inter curl git
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  echo "== 2/5 Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "== 3/5 Библиотеки и браузер для рендера"
npm install --omit=dev
npx playwright install --with-deps chromium
echo "== 4/5 Чек-лист PDF"
node -e "
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const p=await b.newPage();
await p.goto('file://'+process.cwd()+'/templates/checklist.html');await p.evaluate(()=>document.fonts.ready);
await p.pdf({path:'templates/checklist.pdf',format:'A4',printBackground:true});await b.close()})()"
echo "== 5/5 Автозапуск"
sudo npm i -g pm2
[ -f .env ] || cp .env.example .env
echo
echo "Готово. Дальше:"
echo "  1) nano .env        — вставьте ключи, сохраните: Ctrl+O, Enter, Ctrl+X"
echo "  2) npm run test-carousel   — проверка рендера"
echo "  3) pm2 start index.js --name publisher && pm2 save && pm2 startup"
