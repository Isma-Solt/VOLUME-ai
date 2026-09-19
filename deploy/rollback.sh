#!/usr/bin/env bash
# Откат сайта на последнюю резервную копию.
set -euo pipefail

BACKUP_DIR=/var/backups/volume
LAST=$(ls -1t "$BACKUP_DIR"/volume-*.tar.gz 2>/dev/null | head -1)

if [ -z "${LAST:-}" ]; then
  echo "Резервных копий нет — откатывать не с чего."
  exit 1
fi

echo "Откатываю на: $LAST"
read -p "Точно? (yes/no) " ANSWER
[ "$ANSWER" = "yes" ] || { echo "Отменено."; exit 0; }

rm -rf /var/www/volume.broken
mv /var/www/volume /var/www/volume.broken
tar -xzf "$LAST" -C /var/www
chown -R www-data:www-data /var/www/volume
systemctl reload nginx
echo "Готово. Сломанная версия сохранена в /var/www/volume.broken"
