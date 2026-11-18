#!/bin/bash
# ОДНА команда на сервере сайта (Россия): новый ключ + токен бота → всё настраивается на сервере публикатора само.
#   bash <(curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/connect-leads.sh)
AMS=72.56.91.118
cd /opt/crystal && git fetch -q origin main && git reset -q --hard origin/main
sed -i '/^PULL_KEY=/d' /etc/crystal-site.env
K=$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 32); echo "PULL_KEY=$K" >> /etc/crystal-site.env
systemctl restart crystal-site
echo "✅ Новый ключ сайта создан (на экран не выводится)"
read -rsp "Вставьте токен бота заявок от BotFather (с двоеточием, символов не видно) и нажмите Enter: " T </dev/tty; echo
T=$(printf '%s' "$T" | tr -cd '0-9A-Za-z:_-')
case "$T" in *:*) ;; *) echo "❌ Это не токен бота. Скопируйте токен из BotFather и запустите команду снова"; exit 1;; esac
echo "⏳ Подключаюсь к серверу публикатора — если спросит пароль, введите пароль от сервера в Амстердаме"
printf '%s\n%s\n' "$T" "$K" | ssh -o StrictHostKeyChecking=accept-new root@$AMS \
  'read T; read K; export T K; bash <(curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/leads-bot-remote.sh)'
