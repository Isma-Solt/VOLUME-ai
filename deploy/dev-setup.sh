#!/usr/bin/env bash
#
# Разовая настройка dev-версии сайта (раздел 3 инструкции).
# Запуск на сервере под root:  bash /var/www/volume/deploy/dev-setup.sh
#
# Что получится:
#   /var/www/volume-dev  — копия сайта из ветки dev
#   вход по паролю, заявки уходят в отдельный чат, поисковики не индексируют

set -euo pipefail

REPO=https://github.com/Isma-Solt/VOLUME-ai.git
DEV_DIR=/var/www/volume-dev
DEV_ENV=/etc/volume/bot-dev.env
HTPASSWD=/etc/nginx/.htpasswd-dev

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31mОшибка: %s\033[0m\n' "$1" >&2; exit 1; }

# Папка сайта принадлежит www-data, а скрипт работает от root — git считает
# такой репозиторий «чужим» и отказывается с ним работать. Разрешаем явно.
allow_repo() {
    git config --global --get-all safe.directory 2>/dev/null | grep -qx "$1" \
        || git config --global --add safe.directory "$1"
}

allow_repo "$DEV_DIR"
allow_repo /var/www/volume

[ "$(id -u)" -eq 0 ] || die "запустите под root: sudo bash dev-setup.sh"
[ -f /etc/volume/bot.env ] || die "сначала прогоните server-setup.sh"

say "1/5 Спрашиваю домен"
echo "    Если домена ещё нет — просто нажмите Enter,"
echo "    dev-версия откроется по адресу http://IP-СЕРВЕРА:8080"
read -rp "    Поддомен для dev (например dev.volume-studio.ru): " DEV_HOST

say "2/5 Разворачиваю копию сайта"
if [ -d "$DEV_DIR/.git" ]; then
    cd "$DEV_DIR"
    git fetch --quiet origin
    git checkout --quiet dev 2>/dev/null || git checkout --quiet -b dev origin/dev
    git reset --hard --quiet origin/dev
    ok "обновил $DEV_DIR"
else
    git clone --quiet "$REPO" "$DEV_DIR"
    cd "$DEV_DIR"
    if git ls-remote --exit-code --heads origin dev >/dev/null 2>&1; then
        git checkout --quiet -b dev origin/dev
    else
        warn "ветки dev на GitHub нет — пока беру main"
        warn "создайте ветку: git checkout -b dev && git push -u origin dev"
    fi
    ok "склонировал в $DEV_DIR"
fi
chown -R www-data:www-data "$DEV_DIR"
chmod +x "$DEV_DIR"/deploy/*.sh

say "3/5 Отдельный чат для тестовых заявок"
if [ -f "$DEV_ENV" ]; then
    ok "$DEV_ENV уже есть"
else
    cp /etc/volume/bot.env "$DEV_ENV"
    chown root:www-data "$DEV_ENV"; chmod 640 "$DEV_ENV"
    ok "создал $DEV_ENV (копия боевого)"
    warn "чтобы тестовые заявки шли в другой чат — поправьте CHAT_ID в $DEV_ENV"
fi

say "4/5 Пароль на вход"
if [ -f "$HTPASSWD" ]; then
    ok "пароль уже задан ($HTPASSWD)"
else
    command -v htpasswd >/dev/null || { apt-get update -qq; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq apache2-utils; }
    echo "    Придумайте пароль для входа на dev-версию (логин: admin)"
    htpasswd -c "$HTPASSWD" admin
    chown root:www-data "$HTPASSWD"; chmod 640 "$HTPASSWD"
    ok "пароль сохранён"
fi

say "5/5 Настраиваю nginx"
PHP_SOCK=$(ls -1 /run/php/php*-fpm.sock 2>/dev/null | head -1)
[ -n "$PHP_SOCK" ] || die "не нашёл сокет php-fpm"

install -m 644 "$DEV_DIR/deploy/nginx/volume-dev.conf" /etc/nginx/sites-available/volume-dev
sed -i "s#unix:/run/php/php[0-9.]*-fpm.sock#unix:$PHP_SOCK#" /etc/nginx/sites-available/volume-dev

if [ -n "$DEV_HOST" ]; then
    sed -i "s/server_name dev\.ВАШ-ДОМЕН\.ru;/server_name $DEV_HOST;/" /etc/nginx/sites-available/volume-dev
    ADDR="http://$DEV_HOST"
else
    # без домена — вешаем на порт 8080
    sed -i 's/^    listen 80;/    listen 8080;/;  s/^    listen \[::\]:80;/    listen [::]:8080;/' /etc/nginx/sites-available/volume-dev
    sed -i '/server_name dev\.ВАШ-ДОМЕН\.ru;/d' /etc/nginx/sites-available/volume-dev
    IP=$(curl -s --max-time 10 https://api.ipify.org || echo "IP-СЕРВЕРА")
    ADDR="http://$IP:8080"
    command -v ufw >/dev/null && ufw allow 8080/tcp >/dev/null 2>&1 || true
fi

ln -sf /etc/nginx/sites-available/volume-dev /etc/nginx/sites-enabled/volume-dev
nginx -t >/dev/null 2>&1 || { nginx -t; die "конфиг nginx не прошёл проверку"; }
systemctl reload nginx
ok "nginx перезагружен"

cat <<FINAL

────────────────────────────────────────────────────────────
Dev-версия готова: $ADDR
Логин: admin, пароль — который вы только что задали.

Рабочий цикл:
  на компьютере   git push origin dev
  на сервере      /var/www/volume-dev/deploy/update-dev.sh

Понравилось — переносим в боевую версию:
  git checkout main && git merge dev && git push origin main
  на сервере: /var/www/volume/deploy/update.sh
────────────────────────────────────────────────────────────
FINAL
