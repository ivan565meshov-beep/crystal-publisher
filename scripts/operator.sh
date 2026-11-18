#!/bin/bash
# На сервере сайта: вписывает ФИО и ИНН самозанятого в политику, согласие и подвал сайта.
# Данные хранятся только на этом сервере (не в GitHub).
#   bash <(curl -sL https://raw.githubusercontent.com/ivan565meshov-beep/crystal-publisher/main/scripts/operator.sh)
read -rp "ФИО полностью (например: Иванов Иван Иванович): " FIO </dev/tty
read -rp "ИНН (12 цифр): " INN </dev/tty
FIO=$(printf '%s' "$FIO" | tr -cd 'А-Яа-яЁёA-Za-z .-' | sed 's/  */ /g;s/^ //;s/ $//')
INN=$(printf '%s' "$INN" | tr -cd '0-9')
[ ${#INN} -eq 12 ] || { echo "❌ ИНН самозанятого — 12 цифр, а введено ${#INN}. Запустите команду снова"; exit 1; }
[ -n "$FIO" ] || { echo "❌ ФИО пустое"; exit 1; }
mkdir -p /etc/nginx/snippets
cat > /etc/nginx/snippets/crystal-operator.conf <<CONF
sub_filter '{{FIO}}' '$FIO';
sub_filter '{{INN}}' '$INN';
sub_filter_once off;
CONF
grep -q crystal-operator /etc/nginx/sites-available/crystal || sed -i 's|^  index index.html;|  index index.html;\n  include /etc/nginx/snippets/crystal-operator.conf;|' /etc/nginx/sites-available/crystal
cd /opt/crystal && git fetch -q origin main && git reset -q --hard origin/main
nginx -t -q && systemctl reload nginx && echo "✅ Готово: проверьте подвал сайта и https://crystalfinance.ru/politika.html"
