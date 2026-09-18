#!/bin/sh
# Пробне відновлення: найсвіжіший дамп — у тимчасову базу поруч, перевірка кількості записів, базу прибираємо.
# Робочу базу не чіпає. Запуск вручну: docker compose exec backup restore-check.sh
set -eu

DIR=/backups
CHECK_DB=restore_check

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') restore-check: $*"; }

latest=$(ls -1t "$DIR"/daily/db-*.dump 2>/dev/null | head -1)
[ -n "$latest" ] || { log "ПОМИЛКА: копій ще немає"; exit 1; }

log "відновлюю $(basename "$latest") у базу $CHECK_DB"
dropdb --if-exists "$CHECK_DB"
createdb "$CHECK_DB"
trap 'dropdb --if-exists "$CHECK_DB"' EXIT
pg_restore --no-owner --exit-on-error -d "$CHECK_DB" "$latest"

q() { psql -d "$CHECK_DB" -Atc "$1"; }
counts="користувачів $(q 'SELECT count(*) FROM "User"'), товарів $(q 'SELECT count(*) FROM "Product"'), заявок $(q 'SELECT count(*) FROM "Request"'), КП $(q 'SELECT count(*) FROM "KpDocument"')"
log "відновлено: $counts"
date '+%Y-%m-%d %H:%M:%S' > "$DIR/last-restore-check"
echo "$(basename "$latest"): $counts" >> "$DIR/last-restore-check"
