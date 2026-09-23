#!/bin/sh
# Резервна копія щодня: база (pg_dump) і файли (фото, файли заявок, прайси) — дзеркалом, що лише додає нове
# (видалене в застосунку лишається в копії). Щонеділі — ще й архів файлів на момент копії.
# Зберігаємо 14 щоденних і 4 щотижневі копії бази; якщо задано BACKUP_REMOTE — копіюємо все поза сервер (rclone).
set -eu

DIR=/backups
STAMP=$(date +%Y-%m-%d_%H%M)
DAILY_KEEP=${BACKUP_DAILY_KEEP:-14}
WEEKLY_KEEP=${BACKUP_WEEKLY_KEEP:-4}

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') backup: $*"; }

fail() {
  log "ПОМИЛКА: $*"
  date '+%Y-%m-%d %H:%M:%S' > "$DIR/last-error"
  echo "$*" >> "$DIR/last-error"
  exit 1
}

# лишити найновіші N файлів за шаблоном
keep_newest() {
  pattern=$1
  keep=$2
  # shellcheck disable=SC2086
  ls -1t $pattern 2>/dev/null | tail -n +"$((keep + 1))" | while read -r old; do rm -f "$old"; done
}

mkdir -p "$DIR/daily" "$DIR/weekly"

# ── база ──
tmp="$DIR/daily/.db-$STAMP.dump"
pg_dump -Fc -Z 6 -f "$tmp" || fail "pg_dump не вдався"
# копія має читатися — інакше це не копія
pg_restore --list "$tmp" > /dev/null || fail "дамп не читається"
mv "$tmp" "$DIR/daily/db-$STAMP.dump"
log "база: db-$STAMP.dump ($(du -h "$DIR/daily/db-$STAMP.dump" | cut -f1))"
keep_newest "$DIR/daily/db-*.dump" "$DAILY_KEEP"

# ── файли щодня: лише нове й змінене, нічого не видаляємо ──
rclone copy /uploads "$DIR/uploads" --local-no-check-updated || fail "копія файлів не вдалася"
log "файли: $(du -sh "$DIR/uploads" | cut -f1) у $DIR/uploads"

# ── щотижня (неділя): копія бази й архів файлів ──
if [ "$(date +%u)" = "7" ] || [ "${BACKUP_FORCE_WEEKLY:-}" = "1" ]; then
  cp "$DIR/daily/db-$STAMP.dump" "$DIR/weekly/db-$STAMP.dump"
  tar -czf "$DIR/weekly/.uploads-$STAMP.tar.gz" -C /uploads . || fail "архів файлів не вдався"
  mv "$DIR/weekly/.uploads-$STAMP.tar.gz" "$DIR/weekly/uploads-$STAMP.tar.gz"
  log "щотижнева: db-$STAMP.dump, uploads-$STAMP.tar.gz ($(du -h "$DIR/weekly/uploads-$STAMP.tar.gz" | cut -f1))"
  keep_newest "$DIR/weekly/db-*.dump" "$WEEKLY_KEEP"
  keep_newest "$DIR/weekly/uploads-*.tar.gz" "$WEEKLY_KEEP"
fi

# ── поза сервер ──
if [ -n "${BACKUP_REMOTE:-}" ]; then
  # копії — дзеркалом (старі зникають і там), файли — лише додаємо (видалене в застосунку лишається в копії)
  rclone sync "$DIR" "$BACKUP_REMOTE/backups" --exclude ".*" --exclude "last-*" --exclude "uploads/**" || fail "rclone: копії не вивантажено"
  rclone copy /uploads "$BACKUP_REMOTE/uploads" || fail "rclone: файли не вивантажено"
  log "поза сервер: $BACKUP_REMOTE"
else
  log "BACKUP_REMOTE не задано — копії лише на цьому сервері"
fi

rm -f "$DIR/last-error"
date '+%Y-%m-%d %H:%M:%S' > "$DIR/last-ok"
log "готово"
