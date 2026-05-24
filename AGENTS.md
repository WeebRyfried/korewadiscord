# AGENTS.md

## Project

Docker Compose stack running behind Cloudflare Tunnel on `underground.korewadiscord.com`:
- `/wiki` — MediaWiki 1.42 (MariaDB backend)
- `/exam` — Express + SQLite quiz app
- Nginx routes between them inside Docker; host Nginx forwards on port 80.

## Environment

Secrets live in `.env` (never committed). Copy `.env.example` and fill in all `?set` variables before `docker compose up`.
On the VPS: `NGINX_HTTP_BIND=127.0.0.1:8088` (binds privately; host nginx at :80 proxies to it).
Locally: omit or set `NGINX_HTTP_BIND=80`.

## Key Commands

```bash
# local dev
docker compose up -d --build && docker compose ps

# exam-only dev (no Docker)
cd exam && npm install && npm test && npm start

# deploy to VPS
bash scripts/deploy.sh

# VPS: install host nginx site (after .env is populated)
bash scripts/install-nginx-site.sh

# VPS: tunnel status
sudo systemctl status cloudflared-korewadiscord
sudo journalctl -u cloudflared-korewadiscord -f

# backup (from repo root, .env sourced)
set -a && source .env && set +a && bash scripts/backup.sh

# restore
bash scripts/restore.sh backups/20260101-120000
```

## Architecture Notes

- Two nginx layers: host nginx —> Docker nginx (`:8088`) —> app containers.
- `/` redirects to `/wiki`; `/wiki` redirects to `/wiki/`.
- Exam runs on port 3000 inside Docker with `BASE_PATH=/exam`, `X-Forwarded-Prefix` set by nginx.
- Wiki uses `vector-2022` skin; MobileFrontend auto-detects mobile.
- Wiki entrypoint (`docker-entrypoint.sh`) runs `install.php` + `update.php` idempotently.
- Node.js `>=20` required; use `node --test` (built-in test runner).

## Database Constraints

- `attempts` table has partial unique index blocking duplicate IN_PROGRESS/SUBMITTED per Discord ID per test. Reset changes status to `RESET` to allow retake.

## Do Not

- Commit `.env`, `node_modules/`, `exam/data/`, or `backups/`.
- Bind Docker nginx to `0.0.0.0:80` on the VPS — always use `127.0.0.1:8088` there.
- Run `docker compose up` on the VPS without `.env` populated.

## Critical: Deploy Safety

`scripts/deploy.sh` uses `rsync --delete` to sync from local to the VPS. This will delete any file on the VPS that doesn't exist in the local working directory — including Wiki extensions, uploaded images, and imported wiki pages. **Never** run `deploy.sh` from a fresh clone until you have first pulled down the current state from the VPS. When in doubt, `docker compose up -d --build` directly on the VPS instead.

## Critical: This Repo Lives on a VPS — Never Sync Local to Remote

The canonical working directory is `ryfried@minebotserv:/home/ryfried/korewadiscord/`. All editing and file operations must happen **on the VPS via SSH**. Do not edit files locally then SCP/rsync them to the VPS — this will overwrite live production state (wiki extensions, uploaded images, imported pages, database files).

Rules:
- **SSH into the VPS first**, then read and edit files directly on the remote filesystem.
- Never use `scp`, `rsync`, or `scripts/deploy.sh` to push local files to the VPS unless you have explicitly confirmed what will be overwritten.
- If you find yourself working with a local copy through tools like Codex, stop — that local copy is not the source of truth. Connect to the VPS instead.
- If you must copy individual files from VPS to local for reference, use `scp` in pull direction only (`scp ryfried@minebotserv:/home/ryfried/korewadiscord/... .`).

## Operational Safeguards (Post-Incident)

These rules exist because a simple upload-limit change once caused a full wiki config wipe. Do not repeat the same mistakes.

### Before touching anything on the VPS
1. **Inspect live config first.** Read the current `LocalSettings.override.php`, `Dockerfile`, and assets on the VPS before making any change.
2. **Backup remote `wiki/` directory before any redeploy or file overwrite:**
   ```bash
   ssh ryfried@minebotserv "cp -r /home/ryfried/korewadiscord/wiki /home/ryfried/korewadiscord/wiki-backup-\$(date +%Y%m%d-%H%M%S)"
   ```
3. **Refuse to deploy if the local working directory has uncommitted or unrelated changes.** The VPS is the source of truth; reconcile local vs remote first.

### When making changes
- Apply the minimal change. If the ask is "raise upload limit to 5 MB," edit only the PHP ini values in `Dockerfile`. Do not touch `LocalSettings.override.php`, assets, or extensions unless required.
- Rebuild only the affected container: `docker compose up -d --build mediawiki` (not the whole stack).
- Never SCP files from local to the VPS unless you have explicitly compared local vs remote and confirmed nothing will be overwritten.

### After any change to the wiki container
Verify these in order:
1. `docker compose ps` — all containers healthy
2. `/wiki` — main page loads, custom styling present (not bare default MediaWiki look)
3. `/wiki/Special:Version` — extensions loaded: Cite, ParserFunctions, Scribunto, TemplateData, WikiEditor, CodeEditor, VisualEditor, KorewaAdminDashboard
4. A real article — infoboxes, templates, and parser functions render correctly
5. `/wiki/admin` — admin dashboard loads, no "Permission denied" errors
6. VisualEditor works on an editable page
7. Recent pages are intact (spot-check 2-3)

### Critical wiki files (never lose these)
- `wiki/LocalSettings.override.php` — custom skin, extension wiring, upload config
- `wiki/Dockerfile` — PHP settings, extension copies, entrypoint
- `wiki/extensions/KorewaAdminDashboard/` — custom admin dashboard
- `wiki/assets/` — logo, CSS, branding
- `wiki/import/` — imported Fandom templates, modules, pages

File permissions inside the wiki container must be readable by Apache:
```bash
find extensions/KorewaAdminDashboard -type d -exec chmod 755 {} +
find extensions/KorewaAdminDashboard -type f -exec chmod 644 {} +
```

## Exam App Specifics

### Structure
- `exam/src/server.js` — entrypoint, wires config + DB + app
- `exam/src/config.js` — reads env vars (`BASE_PATH`, `EXAM_DB_PATH`, `EXAM_ADMIN_USER`, `EXAM_ADMIN_PASSWORD`, `EXAM_SESSION_SECRET`, `EXAM_COOKIE_SECURE`)
- `exam/src/database.js` — better-sqlite3 with WAL mode, auto-migrates and seeds on first run
- `exam/src/routes/` — public and admin route handlers
- `exam/views/` — EJS templates with `express-ejs-layouts`
- `exam/public/` — static CSS/JS assets
- `exam/tests/smoke.test.js` — uses `node --test` with supertest

### Key behaviors
- Local dev without Docker: `cd exam && npm install && npm test && npm start`
- DB auto-creates tables and seeds one sample test on first start (only if `tests` table is empty)
- Admin credentials default to `ryfried` / `development-password` in dev; production requires env vars
- CSRF protection on all POST/PUT/PATCH/DELETE via `_csrf` field in forms
- Session cookie is `korewa_exam`, path-scoped to `BASE_PATH`, signed with `EXAM_SESSION_SECRET`
- `discord_id` is case-insensitive normalized (lowercase + trimmed)
- `getOrCreateExamUser` auto-creates users on first interaction

### Critical exam files (never lose these)
- `exam/src/database.js` — schema, seed data, all data access functions
- `exam/src/seed-data.js` — the 20 MC + 5 essay sample questions
- `exam/views/` — all EJS templates (public + admin)
- `exam/data/exam.sqlite` — the live database (a Docker volume on the VPS)
- `exam/tests/smoke.test.js` — the only test file

### Restarting just the exam container
```bash
docker compose restart exam
docker compose up -d --build exam
```
