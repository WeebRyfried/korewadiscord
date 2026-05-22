#!/usr/bin/env bash
set -euo pipefail

DATA_DIR=/data
LOCAL_SETTINGS="$DATA_DIR/LocalSettings.php"
HTML_SETTINGS=/var/www/html/LocalSettings.php
OVERRIDE_LINE='require_once "/var/www/html/LocalSettings.override.php";'

required_env=(
  MEDIAWIKI_DB_HOST
  MEDIAWIKI_DB_NAME
  MEDIAWIKI_DB_USER
  MEDIAWIKI_DB_PASSWORD
  MEDIAWIKI_ADMIN_USER
  MEDIAWIKI_ADMIN_PASSWORD
  MEDIAWIKI_SERVER
)

for var_name in "${required_env[@]}"; do
  if [ -z "${!var_name:-}" ]; then
    echo "Missing required environment variable: $var_name" >&2
    exit 1
  fi
done

mkdir -p "$DATA_DIR"

echo "Waiting for MediaWiki database at ${MEDIAWIKI_DB_HOST}:3306..."
for attempt in $(seq 1 60); do
  if mysqladmin ping -h"${MEDIAWIKI_DB_HOST}" -u"${MEDIAWIKI_DB_USER}" -p"${MEDIAWIKI_DB_PASSWORD}" --silent; then
    break
  fi

  if [ "$attempt" = "60" ]; then
    echo "Timed out waiting for MediaWiki database." >&2
    exit 1
  fi

  sleep 2
done

if [ ! -f "$LOCAL_SETTINGS" ]; then
  echo "Installing MediaWiki and creating the initial admin account..."
  install_password="$(php -r 'echo bin2hex(random_bytes(20));')"
  php maintenance/install.php \
    --dbtype=mysql \
    --dbserver="${MEDIAWIKI_DB_HOST}" \
    --dbname="${MEDIAWIKI_DB_NAME}" \
    --dbuser="${MEDIAWIKI_DB_USER}" \
    --dbpass="${MEDIAWIKI_DB_PASSWORD}" \
    --server="${MEDIAWIKI_SERVER}" \
    --scriptpath="${MEDIAWIKI_SCRIPT_PATH:-/wiki}" \
    --pass="${install_password}" \
    --confpath="$DATA_DIR" \
    "${MEDIAWIKI_SITE_NAME:-KorewaDiscord Underground Wiki}" \
    "${MEDIAWIKI_ADMIN_USER}"
fi

if ! grep -Fq "$OVERRIDE_LINE" "$LOCAL_SETTINGS"; then
  {
    echo ""
    echo "$OVERRIDE_LINE"
  } >> "$LOCAL_SETTINGS"
fi

rm -f "$HTML_SETTINGS"
cp "$LOCAL_SETTINGS" "$HTML_SETTINGS"
chown www-data:www-data "$HTML_SETTINGS"
chmod 640 "$HTML_SETTINGS"

php maintenance/update.php --quick --skip-external-dependencies

php maintenance/changePassword.php \
  --user="${MEDIAWIKI_ADMIN_USER}" \
  --password="${MEDIAWIKI_ADMIN_PASSWORD}"

exec "$@"
