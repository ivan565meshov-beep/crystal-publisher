#!/bin/bash
# Вызывается из connect-leads.sh на сервере публикатора; T (токен) и K (ключ сайта) приходят через переменные окружения.
D=$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);console.log((a.find(x=>/publisher/.test(x.name))||a[0]).pm2_env.pm_cwd)}catch{}})')
[ -f "$D/index.js" ] || D=/root/crystal-publisher
cd "$D" || { echo "❌ Не нашёл публикатор"; exit 1; }
git fetch -q origin main && git reset -q --hard origin/main
NAME=$(curl -sm 15 "https://api.telegram.org/bot$T/getMe" | grep -o '"username":"[^"]*' | cut -d'"' -f4)
[ -z "$NAME" ] && { echo "❌ Токен не подошёл — проверьте, что это токен бота заявок"; exit 1; }
echo "✅ Бот найден: @$NAME"
echo "👉 Откройте @$NAME в Telegram и нажмите «Старт» (или напишите ему любое слово). Жду до 3 минут…"
for i in $(seq 1 60); do
  C=$(curl -sm 15 "https://api.telegram.org/bot$T/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*' | tail -1 | grep -o -- '-\?[0-9]*$')
  [ -n "$C" ] && break; sleep 3
done
[ -z "$C" ] && { echo "❌ Не дождался «Старт» — запустите команду ещё раз"; exit 1; }
for kv in "LEADS_BOT_TOKEN=$T" "LEADS_CHAT_ID=$C" "SITE_PULL_KEY=$K"; do
  k=${kv%%=*}; grep -q "^$k=" .env 2>/dev/null && sed -i "s|^$k=.*|$kv|" .env || echo "$kv" >> .env
done
pm2 restart publisher >/dev/null 2>&1 || pm2 restart all >/dev/null
curl -s "https://api.telegram.org/bot$T/sendMessage" -d chat_id="$C" --data-urlencode text="✅ Бот заявок CRYSTAL FINANCE подключён. Сюда будут приходить заявки с сайта crystalfinance.ru" >/dev/null
echo "✅ Готово: бот прислал сообщение в Telegram. Можно оставить тестовую заявку на https://crystalfinance.ru"
