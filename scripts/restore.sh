#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 path/to/backup-directory" >&2
  exit 1
fi

BACKUP_DIR="$1"

test -f "$BACKUP_DIR/mediawiki.sql"
test -f "$BACKUP_DIR/exam.sqlite"

docker compose up -d mediawiki-db exam

docker compose exec -T mediawiki-db mariadb \
  -u root \
  -p"${MEDIAWIKI_DB_ROOT_PASSWORD:?set MEDIAWIKI_DB_ROOT_PASSWORD in .env}" \
  "${MEDIAWIKI_DB_NAME:?set MEDIAWIKI_DB_NAME in .env}" < "$BACKUP_DIR/mediawiki.sql"

docker compose cp "$BACKUP_DIR/exam.sqlite" exam:/app/data/exam.sqlite

if [ -d "$BACKUP_DIR/wiki_images" ]; then
  docker compose cp "$BACKUP_DIR/wiki_images/." mediawiki:/var/www/html/images
fi

docker compose restart
echo "Restore completed."
