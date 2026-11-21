#!/bin/bash
# Автоматическое усиление защиты сервера сайта. Запускается само (один раз на версию) программой приёма заявок,
# работающей от root. Каждый шаг безопасный: nginx проверяется перед применением и откатывается при ошибке.
# Вход по SSH здесь НЕ меняется, чтобы не закрыть владельцу доступ.
export DEBIAN_FRONTEND=noninteractive
F=/etc/nginx/sites-available/crystal
S=/etc/nginx/snippets
mkdir -p $S
ok=() ; bad=()

# 1. Защитные заголовки + список заблокированных адресов
cat > $S/crystal-security.conf <<'NG'
add_header Strict-Transport-Security "max-age=31536000" always;
add_header X-Frame-Options SAMEORIGIN always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()" always;
include /etc/nginx/snippets/crystal-deny.conf;
NG
[ -f $S/crystal-deny.conf ] || : > $S/crystal-deny.conf
cp $F /root/crystal.nginx.bak
if ! grep -q crystal-security $F; then
  sed -i 's|^  index index.html;|  index index.html;\n  include /etc/nginx/snippets/crystal-security.conf;|' $F
  # в nginx заголовки сервера не действуют внутри location со своими add_header — добавим и туда
  sed -i 's|add_header X-Robots-Tag noindex; }|add_header X-Robots-Tag noindex; include /etc/nginx/snippets/crystal-security.conf; }|' $F
fi
if nginx -t -q 2>/dev/null; then systemctl reload nginx && ok+=("заголовки защиты"); else cp /root/crystal.nginx.bak $F; nginx -t -q && systemctl reload nginx; bad+=("заголовки (откатил)"); fi

# 2. fail2ban — блокирует подбор пароля к серверу (5 ошибок за 10 минут → бан на час)
if ! command -v fail2ban-client >/dev/null; then timeout 600 apt-get install -y -qq fail2ban >/dev/null 2>&1; fi
if command -v fail2ban-client >/dev/null; then
  printf '[sshd]\nenabled = true\nmaxretry = 5\nfindtime = 10m\nbantime = 1h\n' > /etc/fail2ban/jail.d/crystal.local
  systemctl enable -q --now fail2ban && systemctl restart fail2ban && ok+=("fail2ban (защита от подбора пароля)") || bad+=("fail2ban")
else bad+=("fail2ban не установился"); fi

# 3. Автоматические обновления безопасности Ubuntu
if ! dpkg -s unattended-upgrades >/dev/null 2>&1; then timeout 600 apt-get install -y -qq unattended-upgrades >/dev/null 2>&1; fi
if dpkg -s unattended-upgrades >/dev/null 2>&1; then
  printf 'APT::Periodic::Update-Package-Lists "1";\nAPT::Periodic::Unattended-Upgrade "1";\n' > /etc/apt/apt.conf.d/20auto-upgrades && ok+=("автообновления безопасности")
else bad+=("автообновления"); fi

echo "OK: ${ok[*]}"; echo "FAIL: ${bad[*]}"
