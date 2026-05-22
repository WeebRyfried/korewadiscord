#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$BACKUP_DIR"

docker compose exec -T mediawiki-db mariadb-dump \
  -u root \
  -p"${MEDIAWIKI_DB_ROOT_PASSWORD:?set MEDIAWIKI_DB_ROOT_PASSWORD in .env}" \
  "${MEDIAWIKI_DB_NAME:?set MEDIAWIKI_DB_NAME in .env}" > "$BACKUP_DIR/mediawiki.sql"

docker compose cp mediawiki:/var/www/html/images "$BACKUP_DIR/wiki_images"
docker compose cp exam:/app/data/exam.sqlite "$BACKUP_DIR/exam.sqlite"

tar -czf "$BACKUP_DIR.tar.gz" -C "$(dirname "$BACKUP_DIR")" "$(basename "$BACKUP_DIR")"
echo "Backup written to $BACKUP_DIR.tar.gz"
