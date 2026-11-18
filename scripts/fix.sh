#!/bin/bash
# Принудительное обновление публикатора до свежей версии с GitHub + перезапуск.
# Запуск на сервере одной строкой:
#   curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/fix.sh | bash
REPO=https://github.com/ivan565meshov-beep/crystal-publisher.git

# папка, из которой pm2 запускает публикатор
D=$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);const p=a.find(x=>/publisher/.test(x.name))||a[0];console.log(p.pm2_env.pm_cwd)}catch{}})')
for c in "$D" ~/publisher ~/crystal-publisher /root/publisher /root/crystal-publisher; do
  [ -n "$c" ] && [ -f "$c/index.js" ] && { D="$c"; break; }
done
[ -f "$D/index.js" ] || { echo "❌ Не нашёл папку публикатора"; exit 1; }
cd "$D" && echo "📁 Папка: $D"

echo "— что мешало автообновлению:"
if [ ! -d .git ]; then
  echo "  папка не была git-репозиторием (ставили из архива) — подключаю GitHub"
  git init -q && git remote add origin "$REPO"
else
  git status --short | head -10
fi

git fetch -q origin main || { echo "❌ Не удалось скачать с GitHub"; exit 1; }
git reset -q --hard origin/main && echo "✅ Код обновлён: $(git log --oneline -1)"
npm install --omit=dev --silent >/dev/null 2>&1 && echo "✅ Зависимости на месте"
pm2 restart publisher >/dev/null 2>&1 || pm2 restart all >/dev/null 2>&1
pm2 save >/dev/null 2>&1
echo "✅ Публикатор перезапущен"
sleep 5; pm2 logs --nostream --lines 8 2>/dev/null | tail -8
