#!/bin/bash
# Установка сайта CRYSTAL FINANCE на чистый сервер Ubuntu (в России).
#   curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/setup-site.sh | bash
set -e
DOMAIN=crystalfinance.ru
REPO=https://github.com/ivan565meshov-beep/crystal-publisher.git
D=/opt/crystal
export DEBIAN_FRONTEND=noninteractive

echo "⏳ Ставлю программы (2–3 минуты)…"
apt-get update -qq
apt-get install -y -qq nginx git curl ufw certbot python3-certbot-nginx >/dev/null
if ! command -v node >/dev/null || [ "$(node -v | cut -c2- | cut -d. -f1)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null && apt-get install -y -qq nodejs >/dev/null
fi
echo "✅ Программы установлены"

[ -d $D/.git ] || git clone -q $REPO $D
cd $D && git fetch -q origin main && git reset -q --hard origin/main
echo "✅ Сайт скачан"

# приём заявок
[ -f /etc/crystal-site.env ] || printf 'LEADS_BOT_TOKEN=\nLEADS_CHAT_ID=\nPORT=8090\n' > /etc/crystal-site.env
chmod 600 /etc/crystal-site.env
mkdir -p /var/lib/crystal-site && chmod 700 /var/lib/crystal-site
cat > /etc/systemd/system/crystal-site.service <<EOF
[Unit]
Description=CRYSTAL FINANCE leads
After=network.target
[Service]
EnvironmentFile=/etc/crystal-site.env
ExecStart=/usr/bin/node $D/site-server/server.js
Restart=always
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload && systemctl enable -q --now crystal-site && systemctl restart crystal-site
echo "✅ Приём заявок запущен"

# nginx
cat > /etc/nginx/sites-available/crystal <<EOF
server {
  listen 80 default_server;
  server_name $DOMAIN www.$DOMAIN _;
  root $D/site;
  index index.html;
  error_page 404 /404.html;
  location /api/ { proxy_pass http://127.0.0.1:8090; proxy_set_header X-Real-IP \$remote_addr; client_max_body_size 32k; }
  location ~* \.(css|js|woff2|jpg|webp|svg|png)$ { expires 30d; access_log off; }
  location / { try_files \$uri \$uri.html \$uri/ =404; }
  add_header X-Content-Type-Options nosniff;
  add_header Referrer-Policy strict-origin-when-cross-origin;
}
EOF
ln -sf /etc/nginx/sites-available/crystal /etc/nginx/sites-enabled/crystal
rm -f /etc/nginx/sites-enabled/default
nginx -t -q && systemctl reload nginx
ufw allow OpenSSH >/dev/null; ufw allow 'Nginx Full' >/dev/null; ufw --force enable >/dev/null
echo "✅ Сайт открыт по адресу http://$(curl -s4 ifconfig.me)"

# автообновление сайта с GitHub каждые 10 минут
echo "*/10 * * * * root cd $D && git fetch -q origin main && git reset -q --hard origin/main && systemctl restart crystal-site" > /etc/cron.d/crystal-site

# HTTPS — получится, только когда домен уже указывает на этот сервер
if [ "$(getent hosts $DOMAIN | awk '{print $1}' | head -1)" = "$(curl -s4 ifconfig.me)" ]; then
  certbot --nginx -n --agree-tos --register-unsafely-without-email --redirect -d $DOMAIN -d www.$DOMAIN >/dev/null 2>&1 \
    && echo "✅ HTTPS включён: https://$DOMAIN" || echo "⚠️ HTTPS пока не получился — повторим позже"
else
  echo "ℹ️ Домен ещё не направлен на этот сервер — HTTPS включим после настройки DNS"
fi
echo "🎉 Готово"
