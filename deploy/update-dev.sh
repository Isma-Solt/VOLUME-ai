#!/usr/bin/env bash
# Обновление dev-версии сайта. Берёт код из ветки dev.
set -euo pipefail

DEV_DIR=/var/www/volume-dev
BRANCH=${1:-dev}

echo "==> Обновляю dev-версию из ветки '$BRANCH'"
cd "$DEV_DIR"
git fetch origin
git reset --hard "origin/$BRANCH"
chown -R www-data:www-data "$DEV_DIR"
nginx -t && systemctl reload nginx
echo "Готово: http://dev.ВАШ-ДОМЕН.ru"
