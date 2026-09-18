#!/bin/sh
# Розклад резервних копій (час — за TZ): копія щодня, пробне відновлення 1-го числа.
set -eu

cat > /etc/crontabs/root <<EOF
${BACKUP_CRON:-30 2 * * *} /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1
${RESTORE_CHECK_CRON:-0 4 1 * *} /usr/local/bin/restore-check.sh > /proc/1/fd/1 2>&1
EOF

echo "backup: розклад копій «${BACKUP_CRON:-30 2 * * *}», пробне відновлення «${RESTORE_CHECK_CRON:-0 4 1 * *}» (TZ=${TZ:-UTC})"
exec crond -f -l 8
