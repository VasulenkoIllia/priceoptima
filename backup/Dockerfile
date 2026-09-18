# Резервні копії PriceOptima: pg_dump тієї ж версії, що й база, rclone для копії поза сервер, cron за розкладом.
FROM postgres:16-alpine
RUN apk add --no-cache rclone tzdata
COPY backup.sh restore-check.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore-check.sh /usr/local/bin/entrypoint.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
