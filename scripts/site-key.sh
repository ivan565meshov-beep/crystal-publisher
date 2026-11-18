#!/bin/bash
# На сервере сайта (Россия): создаёт секретный ключ, по которому публикатор забирает заявки, и пробует включить HTTPS.
#   bash <(curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/site-key.sh) [new]
DOMAIN=crystalfinance.ru
cd /opt/crystal && git fetch -q origin main && git reset -q --hard origin/main
[ "$1" = "new" ] && sed -i '/^PULL_KEY=/d' /etc/crystal-site.env   # «new» — выдать новый ключ (старый перестанет работать)
K=$(grep -s '^PULL_KEY=' /etc/crystal-site.env | cut -d= -f2)
if [ -z "$K" ]; then K=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32); echo "PULL_KEY=$K" >> /etc/crystal-site.env; fi
systemctl restart crystal-site
if [ "$(getent hosts $DOMAIN | awk '{print $1}' | head -1)" = "$(curl -s4 ifconfig.me)" ]; then
  certbot --nginx -n --agree-tos --register-unsafely-without-email --redirect -d $DOMAIN -d www.$DOMAIN >/dev/null 2>&1 \
    && echo "✅ HTTPS включён: https://$DOMAIN" || echo "⚠️ HTTPS пока не получился"
else echo "ℹ️ Домен ещё не дошёл до сервера — HTTPS включится при следующем запуске этой команды"; fi
echo
echo "🔑 Ключ сайта (скопируйте его, он понадобится на втором сервере; никому не отправляйте):"
echo "$K"
