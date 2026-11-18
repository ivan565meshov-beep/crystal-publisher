#!/bin/bash
# Подключение Telegram-бота для заявок с сайта. Токен вводится вручную и не показывается на экране.
#   bash <(curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/leads-bot.sh)
echo "Проверяю связь с Telegram…"
curl -sm 15 -o /dev/null https://api.telegram.org || { echo "❌ Этот сервер не достучался до Telegram (api.telegram.org). Напишите Claude"; exit 1; }
echo "✅ Связь с Telegram есть"
read -rsp "Вставьте токен бота от BotFather (символы не видны) и нажмите Enter: " T </dev/tty; echo
T=$(printf '%s' "$T" | tr -cd '0-9A-Za-z:_-')
[ -z "$T" ] && { echo "❌ Токен пустой"; exit 1; }
NAME=$(curl -sm 15 "https://api.telegram.org/bot$T/getMe" | grep -o '"username":"[^"]*' | cut -d'"' -f4)
[ -z "$NAME" ] && { echo "❌ Токен не подошёл — проверьте, что скопировали полностью"; exit 1; }
echo "✅ Бот найден: @$NAME"
echo "👉 Откройте в Telegram @$NAME, нажмите «Старт» (или напишите ему любое слово)."
for i in $(seq 1 60); do
  C=$(curl -sm 15 "https://api.telegram.org/bot$T/getUpdates" | grep -o '"chat":{"id":-\?[0-9]*' | tail -1 | grep -o -- '-\?[0-9]*$')
  [ -n "$C" ] && break; sleep 3
done
[ -z "$C" ] && { echo "❌ Не дождался сообщения боту — запустите команду ещё раз"; exit 1; }
sed -i "s|^LEADS_BOT_TOKEN=.*|LEADS_BOT_TOKEN=$T|; s|^LEADS_CHAT_ID=.*|LEADS_CHAT_ID=$C|" /etc/crystal-site.env
systemctl restart crystal-site
curl -s "https://api.telegram.org/bot$T/sendMessage" -d chat_id="$C" --data-urlencode text="✅ Бот заявок CRYSTAL FINANCE подключён. Сюда будут приходить заявки с сайта crystalfinance.ru" >/dev/null
echo "✅ Готово: проверьте Telegram — бот прислал сообщение"
