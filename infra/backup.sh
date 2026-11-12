#!/usr/bin/env bash
# Backup diario do robo TS PickUps: bancos (pg_dump) e volume do n8n.
set -euo pipefail
DEST="${BACKUP_DIR:-/media/SSD-Storage/backups/ts-pickups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
OUT="$DEST/$(date +%Y-%m-%d_%H%M)"
umask 077
mkdir -p "$OUT"

docker exec ts-pickups-bot-bot-db-1 sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$OUT/bot.sql.gz"
docker exec typebot-typebot-db-1 pg_dump -U postgres -d typebot | gzip > "$OUT/typebot.sql.gz"

# O n8n guarda tudo num arquivo SQLite: para copiar com seguranca, para por alguns segundos.
docker stop ts-pickups-bot-n8n-1 > /dev/null
trap 'docker start ts-pickups-bot-n8n-1 > /dev/null' EXIT
docker run --rm -v ts-pickups-bot_n8ndata:/dados:ro -v "$OUT":/backup alpine tar czf /backup/n8ndata.tgz -C /dados .
docker start ts-pickups-bot-n8n-1 > /dev/null
trap - EXIT

for f in bot.sql.gz typebot.sql.gz n8ndata.tgz; do
  [ -s "$OUT/$f" ] || { echo "ERRO: $f vazio" >&2; exit 1; }
done

find "$DEST" -mindepth 1 -maxdepth 1 -type d -mtime +"$KEEP_DAYS" -exec rm -rf {} +
echo "Backup ok: $OUT"