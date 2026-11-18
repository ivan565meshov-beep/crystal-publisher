#!/bin/bash
# На сервере публикатора (Амстердам): подключает Telegram-бот заявок с сайта.
#   bash <(curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/leads-bot.sh)
D=$(pm2 jlist 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const a=JSON.parse(s);console.log((a.find(x=>/publisher/.test(x.name))||a[0]).pm2_env.pm_cwd)}catch{}})')
[ -f "$D/index.js" ] || D=/root/crystal-publisher
[ -f "$D/index.js" ] || { echo "❌ Это не сервер публикатора. Подключитесь к серверу в Амстердаме"; exit 1; }
cd "$D" && git fetch -q origin main && git reset -q --hard origin/main
curl -sm 15 -o /dev/null https://api.telegram.org || { echo "❌ Нет связи с Telegram"; exit 1; }
read -rsp "1) Вставьте НОВЫЙ токен бота от BotFather (символов не видно) и нажмите Enter: " T </dev/tty; echo
T=$(printf '%s' "$T" | tr -cd '0-9A-Za-z:_-')
NAME=$(curl -sm 15 "https://api.telegram.org/bot$T/getMe" | grep -o '"username":"[^"]*' | cut -d'"' -f4)
[ -z "$NAME" ] && { echo "❌ Токен не подошёл"; exit 1; }
echo "✅ Бот найден: @$NAME — откройте его в Telegram и нажмите «Старт»…"
for i in $(seq 1 60); do
  C=$(curl -sm 15 "https://api.telegram.org/bot$T/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*' | tail -1 | grep -o -- '-\?[0-9]*$')
  [ -n "$C" ] && break; sleep 3
done
[ -z "$C" ] && { echo "❌ Не дождался «Старт» — запустите команду ещё раз"; exit 1; }
read -rsp "2) Вставьте ключ сайта (символов не видно) и нажмите Enter: " K </dev/tty; echo
K=$(printf '%s' "$K" | tr -cd 'A-Za-z0-9')
for kv in "LEADS_BOT_TOKEN=$T" "LEADS_CHAT_ID=$C" "SITE_PULL_KEY=$K"; do
  k=${kv%%=*}; grep -q "^$k=" .env 2>/dev/null && sed -i "s|^$k=.*|$kv|" .env || echo "$kv" >> .env
done
pm2 restart publisher >/dev/null 2>&1 || pm2 restart all >/dev/null
curl -s "https://api.telegram.org/bot$T/sendMessage" -d chat_id="$C" --data-urlencode text="✅ Бот заявок CRYSTAL FINANCE подключён. Сюда будут приходить заявки с сайта crystalfinance.ru" >/dev/null
echo "✅ Готово: бот прислал сообщение в Telegram"
