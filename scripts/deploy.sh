#!/usr/bin/env bash
set -euo pipefail

REMOTE="${DEPLOY_TARGET:-ryfried@minebotserv}"
REMOTE_DIR="${DEPLOY_DIR:-/home/ryfried/korewadiscord}"

rsync -az --delete \
  --exclude ".git" \
  --exclude ".env" \
  --exclude "node_modules" \
  --exclude "exam/data" \
  --exclude "backups" \
  ./ "$REMOTE:$REMOTE_DIR/"

ssh "$REMOTE" "cd '$REMOTE_DIR' && if [ ! -f .env ]; then cp .env.example .env && echo 'Created .env from .env.example. Edit it with production secrets, then rerun deployment.' >&2 && exit 2; fi && docker compose up -d --build && docker compose ps"
