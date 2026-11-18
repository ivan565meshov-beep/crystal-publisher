#!/bin/bash
# На сервере сайта: пароль к странице заявок https://crystalfinance.ru/admin/leads
#   bash <(curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/admin.sh)
cd /opt/crystal && git fetch -q origin main && git reset -q --hard origin/main && systemctl restart crystal-site
read -rsp "Придумайте пароль для страницы заявок (не меньше 8 символов, символов не видно): " P </dev/tty; echo
[ ${#P} -ge 8 ] || { echo "❌ Слишком короткий пароль"; exit 1; }
printf 'crystal:%s\n' "$(openssl passwd -apr1 "$P")" > /etc/nginx/crystal.htpasswd && chmod 640 /etc/nginx/crystal.htpasswd && chown root:www-data /etc/nginx/crystal.htpasswd
F=/etc/nginx/sites-available/crystal
grep -q 'location /admin/' $F || sed -i 's|^  location /api/ |  location /admin/ { auth_basic "CRYSTAL FINANCE"; auth_basic_user_file /etc/nginx/crystal.htpasswd; proxy_pass http://127.0.0.1:8090; add_header X-Robots-Tag noindex; }\n  location /api/ |' $F
nginx -t -q && systemctl reload nginx && echo "✅ Готово. Заявки: https://crystalfinance.ru/admin/leads — логин: crystal, пароль: тот, что вы ввели"
