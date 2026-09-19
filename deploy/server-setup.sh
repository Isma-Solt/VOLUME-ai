#!/usr/bin/env bash
#
# Разовая настройка сервера под сайт VOLUME.
# Делает всё из раздела 1 инструкции deploy/DEPLOY.md автоматически.
#
# Запуск на сервере под root:
#   bash server-setup.sh
#
# Скрипт можно запускать повторно — он не ломает то, что уже настроено.

set -euo pipefail

REPO=https://github.com/Isma-Solt/VOLUME-ai.git
SITE_DIR=/var/www/volume
ENV_FILE=/etc/volume/bot.env

say()  { printf '\n\033[1;34m==> %s\033[0m\n' "$1"; }
ok()   { printf '    \033[32m✓\033[0m %s\n' "$1"; }
warn() { printf '    \033[33m!\033[0m %s\n' "$1"; }
die()  { printf '\n\033[31mОшибка: %s\033[0m\n' "$1" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "запустите под root: sudo bash server-setup.sh"

# ---------------------------------------------------------------- 1. пакеты
say "1/7 Проверяю пакеты"
MISSING=()
command -v nginx >/dev/null || MISSING+=(nginx)
command -v git   >/dev/null || MISSING+=(git)
command -v curl  >/dev/null || MISSING+=(curl)
ls /run/php/*.sock >/dev/null 2>&1 || MISSING+=(php-fpm php-curl)

if [ ${#MISSING[@]} -gt 0 ]; then
    warn "ставлю: ${MISSING[*]}"
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${MISSING[@]}"
fi
ok "пакеты на месте"

# определяем сокет PHP-FPM (версия может быть любой: 8.1, 8.2, 8.3…)
PHP_SOCK=$(ls -1 /run/php/php*-fpm.sock 2>/dev/null | head -1) \
    || die "php-fpm не запущен, проверьте: systemctl status php*-fpm"
[ -n "$PHP_SOCK" ] || die "не нашёл сокет php-fpm в /run/php/"
ok "PHP-FPM: $PHP_SOCK"

# ---------------------------------------------------------------- 2. токен
say "2/7 Настраиваю токен бота"
mkdir -p /etc/volume

if [ -f "$ENV_FILE" ]; then
    ok "$ENV_FILE уже есть, оставляю как есть"
else
    # Старый токен мог лежать в send.php — покажем, но использовать не будем
    if [ -f "$SITE_DIR/api/send.php" ]; then
        warn "старый обработчик найден, сохраняю копию в /root/send.php.backup"
        cp "$SITE_DIR/api/send.php" /root/send.php.backup
    fi

    echo
    echo "    Введите НОВЫЙ токен бота (@BotFather → /revoke → /token)."
    echo "    Символы не отображаются — это нормально."
    read -rsp "    BOT_TOKEN: " BOT_TOKEN; echo
    read -rp  "    CHAT_ID:   " CHAT_ID

    [ -n "$BOT_TOKEN" ] && [ -n "$CHAT_ID" ] || die "токен и chat_id обязательны"

    umask 077
    printf 'BOT_TOKEN=%s\nCHAT_ID=%s\n' "$BOT_TOKEN" "$CHAT_ID" > "$ENV_FILE"
    chown root:www-data "$ENV_FILE"
    chmod 640 "$ENV_FILE"
    ok "токен спрятан в $ENV_FILE (читают только root и веб-сервер)"
fi

# ---------------------------------------------------------------- 3. код
say "3/7 Забираю код из GitHub"
if [ -d "$SITE_DIR/.git" ]; then
    cd "$SITE_DIR"
    git fetch --quiet origin
    # старый незакоммиченный send.php помешал бы обновлению — он уже в бэкапе
    rm -f "$SITE_DIR/api/send.php"
    git reset --hard --quiet origin/main
    ok "обновил $SITE_DIR"
else
    [ -e "$SITE_DIR" ] && mv "$SITE_DIR" "$SITE_DIR.old-$(date +%s)"
    git clone --quiet "$REPO" "$SITE_DIR"
    ok "склонировал в $SITE_DIR"
fi

# ---------------------------------------------------------------- 4. права
say "4/7 Выставляю права"
chown -R www-data:www-data "$SITE_DIR"
find "$SITE_DIR" -type d -exec chmod 755 {} +
find "$SITE_DIR" -type f -exec chmod 644 {} +
chmod +x "$SITE_DIR"/deploy/*.sh
ok "владелец www-data"

# ---------------------------------------------------------------- 5. nginx
say "5/7 Настраиваю nginx"
install -m 644 "$SITE_DIR/deploy/nginx/volume.conf" /etc/nginx/sites-available/volume
# подставляем реальный сокет PHP вместо примера из конфига
sed -i "s#unix:/run/php/php[0-9.]*-fpm.sock#unix:$PHP_SOCK#" /etc/nginx/sites-available/volume
ln -sf /etc/nginx/sites-available/volume /etc/nginx/sites-enabled/volume
rm -f /etc/nginx/sites-enabled/default

nginx -t >/dev/null 2>&1 || { nginx -t; die "конфиг nginx не прошёл проверку"; }
systemctl reload nginx
ok "nginx перезагружен"

# ------------------------------------------------------- 6. связь с Telegram
say "6/7 Проверяю связь с Telegram"
TG_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://api.telegram.org || echo 000)
if [ "$TG_CODE" = "200" ] || [ "$TG_CODE" = "302" ]; then
    ok "api.telegram.org доступен"
else
    warn "api.telegram.org недоступен (код $TG_CODE) — заявки доходить не будут."
    warn "Нужен сервер вне РФ или прокси, см. раздел 4.4 в deploy/DEPLOY.md"
fi

# ------------------------------------------------------- 7. тестовая заявка
say "7/7 Отправляю тестовое сообщение"
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

RESP=$(curl -s --max-time 15 \
    -d "chat_id=$CHAT_ID" \
    --data-urlencode "text=✅ Сервер VOLUME настроен. Это тестовое сообщение." \
    "https://api.telegram.org/bot$BOT_TOKEN/sendMessage" || true)

if printf '%s' "$RESP" | grep -q '"ok":true'; then
    ok "сообщение отправлено — проверьте Telegram"
else
    warn "Telegram не принял сообщение. Ответ:"
    printf '    %s\n' "$RESP"
    warn "Частые причины: вы не нажали Start у бота; неверный CHAT_ID; неверный токен."
fi

cat <<'FINAL'

────────────────────────────────────────────────────────────
Готово.

Дальше обновление сайта — одной командой:
    /var/www/volume/deploy/update.sh

Откат, если что-то сломается:
    /var/www/volume/deploy/rollback.sh

Dev-версия, домен и HTTPS — /var/www/volume/deploy/DEPLOY.md
────────────────────────────────────────────────────────────
FINAL
