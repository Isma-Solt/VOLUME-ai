#!/usr/bin/env bash
# Обновление dev-версии сайта. Берёт код из ветки dev.
set -euo pipefail

DEV_DIR=/var/www/volume-dev
BRANCH=${1:-dev}

# Папка сайта принадлежит www-data, а скрипт работает от root — git считает
# такой репозиторий «чужим» и отказывается с ним работать. Разрешаем явно.
allow_repo() {
    git config --global --get-all safe.directory 2>/dev/null | grep -qx "$1" \
        || git config --global --add safe.directory "$1"
}

allow_repo "$DEV_DIR"

echo "==> Обновляю dev-версию из ветки '$BRANCH'"
cd "$DEV_DIR"
git fetch origin
git reset --hard "origin/$BRANCH"
chown -R www-data:www-data "$DEV_DIR"
nginx -t && systemctl reload nginx
echo "Готово: http://dev.ВАШ-ДОМЕН.ru"
