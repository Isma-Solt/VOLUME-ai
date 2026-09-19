#!/usr/bin/env bash
# Обновление боевого сайта VOLUME из GitHub.
# Запускать на сервере:  sudo /var/www/volume/deploy/update.sh
set -euo pipefail

SITE_DIR=/var/www/volume
BACKUP_DIR=/var/backups/volume
STAMP=$(date +%Y%m%d-%H%M%S)

echo "==> 1/4 Делаю резервную копию"
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/volume-$STAMP.tar.gz" -C /var/www volume
# держим только 10 последних копий, чтобы не забить диск
ls -1t "$BACKUP_DIR"/volume-*.tar.gz | tail -n +11 | xargs -r rm --

echo "==> 2/4 Забираю свежий код из GitHub"
cd "$SITE_DIR"
git fetch origin
git reset --hard origin/main

echo "==> 3/4 Выставляю права"
chown -R www-data:www-data "$SITE_DIR"
find "$SITE_DIR" -type d -exec chmod 755 {} \;
find "$SITE_DIR" -type f -exec chmod 644 {} \;
chmod +x "$SITE_DIR"/deploy/*.sh

echo "==> 4/4 Проверяю и перезагружаю nginx"
nginx -t
systemctl reload nginx

echo
echo "Готово. Резервная копия: $BACKUP_DIR/volume-$STAMP.tar.gz"
echo "Если что-то сломалось — откат: sudo /var/www/volume/deploy/rollback.sh"
