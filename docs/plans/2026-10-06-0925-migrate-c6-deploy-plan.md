---
title: C6 CI, Staging and Production Deploy
type: migrate
status: in-progress
source: plan
date: 2026-10-06
doc_review: 2026-10-06
---

# C6 CI, Staging and Production Deploy

Chunk C6 of `docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md` (the roadmap). Product decisions come from the roadmap and are not repeated here. Roadmap IDs are written "roadmap R2". It builds on C1–C5 (`docs/plans/2026-10-05-1215-…`, `-1246-…`, `-1352-…`, `-1601-…`, `-1722-migrate-c5-photos-plan.md`) and takes its deploy and security baseline from `docs/plans/2026-10-04-1357-housing-service-own-stack-plan.md` (the own-stack plan: Security Baseline, D8, U9), checked against the code that exists now.

## Goal
Every push and pull request runs the whole test suite in GitHub Actions against a real PostgreSQL 17, staging runs the new API and a `rest` UI behind nginx on the organization box, and production has its database, API process, photo bucket and nightly encrypted backups ready for the C7 cutover, without the public site changing.

## Problem
The new stack passes its suites only on a developer laptop. There is no CI, no `deploy/` folder, no backups and no written procedure for the box. Earlier chunks left production gates open: the API listens on every interface, writes have no rate limit, photos are cached for a year, and `TRUST_PROXY`, `files:sweep` and the S3 bucket checks wait on a deploy. C7 can't rehearse a cutover on staging until all of this exists.

## Requirements
- **R1** A GitHub Actions workflow runs on every push and pull request: lint, both typechecks, `i18n-check`, unit and contract tests, `check:prod-bundle`, `npm audit --omit=dev --audit-level=high` for both packages, the server tests, `test:contract:rest`, `test:e2e:rest-admin`, `test:e2e:rest` and `test:e2e:mock`, against a PostgreSQL 17 service container. A red step fails the run (roadmap R2).
- **R2** The three `housing_test` suites run one after another in one job, never in parallel.
- **R3** The API listens on loopback by default, so on the box only nginx can reach it, and `TRUST_PROXY=1` there gives every rate limiter the real client IP (`NE-SEC-10`).
- **R4** Admin writes are rate-limited per admin (all of one admin's sessions share the budget), and an admin over the limit gets the contract's 429 `RATE_LIMITED` error.
- **R5** Photos are served with `Cache-Control: public, max-age=86400`, not a year immutable, so a deleted photo leaves caches within a day (user decision, 2026-10-06).
- **R6** The repo holds everything the box runs: a PM2 ecosystem (API, `files:sweep`, backup), an nginx vhost in nginx 1.20 syntax with the UI security headers and CSP, and deploy, backup and restore-drill scripts. CI checks the nginx config with nginx 1.20 and the shell scripts with shellcheck.
- **R7** One deploy command builds a git ref, migrates with the owner role, switches the release, reloads PM2 and checks `/api/v1/readyz`. If the check fails it switches back to the previous release.
- **R8** A nightly `pg_dump` per environment is encrypted with age and stored in S3 for 30 days. A restore drill script restores the latest backup into a scratch database and checks row counts and serial counters.
- **R9** A runbook in `docs/operations/` lists every step that needs a person on the box or in AWS or Cloudflare, with an ops checklist: first setup, deploy, rollback, restore drill, uptime monitor, log rotation and bucket checks.
- **R10** Production stays on `VITE_HOUSING_BACKEND=supabase` and its nginx vhost is not changed. C6 prepares only the production database, env files, API process (loopback only), bucket and backups (roadmap R15).
- **R11** The admin import parser uses SheetJS 0.20.3, so `npm audit --omit=dev --audit-level=high` passes with no exception, and the import works exactly as before (user decision, 2026-10-06).

## Scope
- In:
  - `.github/workflows/ci.yml` and `.github/dependabot.yml`
  - server changes: `HOST`, the write rate limit, the photo `Cache-Control`
  - replacing `xlsx` 0.18.5 with SheetJS 0.20.3 in the admin import (the audit gate)
  - `deploy/`: PM2 ecosystem, nginx templates, deploy, backup and restore-drill scripts
  - an `edge` compose service: nginx 1.20 in front of the local API and built UI, for a production-shaped check
  - `docs/operations/runbook.md`, and updates to migration-notes, the testing guide, `server/.env.example` and the roadmap
- Out (not now):
  - Running anything on the real box or in AWS or Cloudflare. This session has no access, so those steps go into the runbook.
  - Switching production's UI or vhost to the new stack (C7).
  - Deploys triggered from CI over SSH. The deploy script is run by a person on the box for now. When a deploy job is added later, it gets its own workflow with a protected GitHub Environment (required reviewers, `main` and tags only), and no workflow ever uses `pull_request_target`.
  - The S3 storage tests in CI. They are run once by hand against a test bucket (runbook), so CI holds no AWS keys.
  - A storage `list` operation and an orphan-object sweep (see Technical decisions).
  - Activity-log indexes (C7, at real data volume).
  - PM2 cluster mode or a Postgres-backed rate-limit store.

## Key decisions
- **PostgreSQL 17 self-hosted on the PM2 box, localhost only** (user decision, 2026-10-06; closes the roadmap's Postgres-host question).
- **AWS S3 for photos and backups** (user decision, 2026-10-06; closes the roadmap's S3-provider question).
- **Production UI already runs from the box's nginx; Cloudflare proxies the domains** (user facts, 2026-10-06).
- **Photo cache drops to one day** (user decision, 2026-10-06). Governs R5.
- **Doc review decisions** (user, 2026-10-06):
  - Replace `xlsx` 0.18.5 with SheetJS 0.20.3 instead of allowlisting its advisories. Governs R11.
  - Keep the local `edge` nginx and the `edge-rest` CSP browser test.
  - Protect the origin with Cloudflare Authenticated Origin Pulls; no IP-range gate.
  - Split the env files with one Linux user per environment; no separate deploy user.
  - Backups undeletable for 30 days (S3 Object Lock).
  - GitHub Actions pinned to commit SHAs.

## Technical decisions

**Diagram:** `docs/diagrams/backend-architecture.md` ("Deployment (C6)", Mermaid like the rest of the repo's diagrams): Cloudflare → nginx → PM2 API, the per-environment Postgres cluster and buckets, the sweep and backup jobs, and the deploy path.

**Stack profile.** Unchanged from the roadmap: Express 5, PostgreSQL 17 through `postgres` + dbmate (not Prisma), the minimal admin session (not auth-core), and the storage adapter with the S3 driver (`ST-05`, temporary). C6 adds no runtime dependency. The repo still has no `CLAUDE.md` `## Stack profile` (`ST-43`); that stays with the roadmap's ST-03/ST-04 amendment task.

**CI**
- **GitHub Actions** (the repo is on GitHub). Four jobs on `ubuntu-24.04`, Node from `.nvmrc`, `npm ci` in the root and in `server/` (`ST-21`):
  1. `checks`: `npm run lint`, `npm run build` (`tsc -b` + vite: the web typecheck), `npm --prefix server run typecheck`, `npm run i18n-check`, `npm test`, `npm run check:prod-bundle`, and `npm audit --omit=dev --audit-level=high` in both packages (`ST-31`).
  2. `db-suites`: a `postgres:17` service on `127.0.0.1:5432`. `server/db/docker-init/01-init.sh` (made runnable outside Docker in U3) creates the roles with the local default passwords plus the `housing` and `housing_test` databases, so `server/test/support/env.ts` and `scripts/lib/migrate-test-db.mjs` work with their defaults. The steps run in this order, in one job (R2): `npm --prefix server test`, `npm run test:contract:rest`, Playwright Chromium install, `npm run test:e2e:rest-admin`. Then, on the separate `housing` database: migrate, `db:seed`, `npm --prefix server run build`, start `node server/dist/server.js` in the background (this also proves the production build starts), wait for `/api/v1/readyz`, and run `npm run test:e2e:rest` (roadmap R2: the public flows on `rest`). The background API gets: `DATABASE_URL` as `housing_app` on `housing`, `ALLOWED_ORIGINS=http://localhost:5185` (the `public-rest` UI), `COOKIE_SECURE=false`, `PUBLIC_API_URL=http://localhost:3001`, `STORAGE_DRIVER=nas` with `STORAGE_ROOT` in `$RUNNER_TEMP`, and `LOG_LEVEL=warn`; `config.ts` refuses to start without the first four.
  3. `e2e-mock`: Playwright Chromium, `npm run test:e2e:mock`.
  4. `deploy-config`: renders the nginx templates with sample values and runs `nginx -t` in `nginx:1.20` (with a throwaway self-signed certificate), runs `shellcheck` on `deploy/*.sh` and `scripts/docker-dev-entry.sh`, and loads `deploy/ecosystem.config.cjs` with `node` for both environments.
- **Playwright browsers cached** in `~/.cache/ms-playwright`, keyed on the installed `@playwright/test` version. On a cache hit only `npx playwright install-deps chromium` runs.
- **Playwright traces and reports uploaded as artifacts** on failure only.
- **No secrets in CI.** The S3 tests skip without `TEST_S3_*` (C5). Running them once by hand against a test bucket is a runbook step and an ops checklist item. That keeps AWS keys out of GitHub, and pull requests from forks get no secrets anyway.
- **Dependabot** for npm in `/` and `/server` and for GitHub Actions, weekly (own-stack plan Security Baseline).
- **Third-party actions pinned to full commit SHAs** with the version in a comment (`uses: actions/checkout@<sha> # v4`); Dependabot updates the pins. `npm ci` runs with `--ignore-scripts` in CI too (`ST-32`).

**Server gates (code in this chunk)**
- **`HOST`** (new config, default `127.0.0.1`; `NE-CFG-01`). `server.ts` passes it to `app.listen`. The compose `api` service sets `HOST=0.0.0.0` because the published port reaches the container through Docker's network. On the box nothing else is needed: the API answers only on loopback, so `X-Forwarded-For` can only come from nginx (C2 note).
- **`TRUST_PROXY=1` on the box.** Cloudflare → nginx → API. nginx restores the client IP from `CF-Connecting-IP`, trusting only Cloudflare's published ranges (`real_ip_header`, `set_real_ip_from`), and then **overwrites** `X-Forwarded-For` with `$remote_addr` instead of appending. The API therefore sees exactly one trusted hop, and a client can't push a fake address past it (`NE-SEC-10`).
- **Write rate limit: 120 writes per admin per minute, in memory** (`NE-SEC-04`). It sits in `housing-admin.ts` on the router-level guard (line 69), after `requireAdmin` and before any body parser, and keys on `req.admin.id`. Login, logout and the activity-log `POST` aren't counted. A bulk request counts as one write. The 200-row import batches and the 2-at-a-time bulk photo page stay far below the limit, while a stolen session or a runaway script is stopped. The limit is a `createApp` option (like the read and photo limits), so tests can set it low. One API process, as before (C2).
- **Photo `Cache-Control: public, max-age=86400`**, without `immutable` (R5). The URL still changes on every upload, so a replaced photo never shows stale bytes. Only a deleted one can stay in a cache, for up to a day. There is no CDN purge.
- **No orphan sweep or storage `list` now.** An object with no `housing_files` row can only come from a crash between the storage write and the commit. It is invisible (nothing links to it) and costs a few KB. The runbook has a quarterly manual check: the bucket's key list from `aws s3 ls`, compared with `select key from housing_files`. A `list` operation comes with the NAS copy script (`NS-50`), which needs one anyway.

**Box layout**
- **One Linux user per environment** (`housing-staging`, `housing-prod`), each with its own PM2 daemon (`pm2 startup systemd -u <user>`). A staging compromise can't read production's env file.
- **Two PostgreSQL 17 clusters**: staging on port 5433 and production on 5432, both `listen_addresses = 'localhost'` with `scram-sha-256` in `pg_hba.conf` (`DB-ROLE-03`). The migrations grant to the fixed role names `housing_owner` and `housing_app` (0006, 0009). One cluster would make staging and production share those roles and their passwords, so each environment gets its own cluster, its own roles (`server/db/roles.sql`, run once per cluster) and its own passwords. This is an isolation choice (staging credentials must not open production data), not something the code forces: per-environment role names would also work but mean changing migrations that have already run.
- **Directories**: `/srv/housing/<env>/repo` (a clone), `/srv/housing/<env>/releases/<sha>` and the `current` symlink. Env files outside the repo, mode 600, owned by the environment user (own-stack plan Security Baseline):
  - `/etc/housing/<env>/api.env`: runtime settings, `DATABASE_URL` as `housing_app`, the S3 settings and the app's AWS keys.
  - `/etc/housing/<env>/build.env`: only the public `VITE_*` build values (`VITE_HOUSING_BACKEND`, `VITE_API_BASE_URL`, and for a `supabase` build the anon URL and key). Nothing secret; these values end up in the browser bundle.
  - `/etc/housing/<env>/deploy.env`: `DATABASE_MIGRATION_URL` as `housing_owner`, and the backup bucket, age recipient and backup AWS keys. It is sourced only by the migrate step, `backup.sh` and the admin CLI, never during `npm ci` or the build, so dependency code never runs with the owner credential in its environment.
  - One Linux user per environment reads all three files. The runtime role `housing_app` can already read and change every row, so a separate deploy user would add little; the split keeps the owner URL out of the build and the API process.
- **The API loads its env with Node's `--env-file`** (`node_args` in the ecosystem), so PM2 never saves the secrets in its dump file.
- **Ports**: staging API 3101, production API 3201, both loopback only.

**PM2 (`deploy/ecosystem.config.cjs`)**
- The file reads `HOUSING_ENV` (`staging` | `production`) and throws if it is missing or unknown.
- `housing-api-<env>`: `fork` mode, one instance, `cwd` = `current`, script `server/dist/server.js`, `kill_timeout: 15000` (more than the server's 10-second forced exit, `NE-ERR-04`), `max_memory_restart: 400M`.
- `housing-sweep-<env>`: `node --env-file=/etc/housing/<env>/api.env server/dist/cli/files-sweep.js` (the build emits `dist/cli/*.js`; `files-sweep.ts` reads `DATABASE_URL`), `cron_restart: '30 3 * * *'`, `autorestart: false`.
- `housing-backup-<env>`: `deploy/backup.sh` with `interpreter: 'bash'`, `cron_restart: '15 2 * * *'`, `autorestart: false`. `backup.sh` sources `/etc/housing/<env>/deploy.env` itself, so PM2's environment never holds the owner URL or the backup keys.
- PM2 runs a cron app once whenever it is started. So `deploy.sh` reloads only the API (`--only housing-api-<env>`), and the two cron apps are started once at setup (runbook) and again only when the ecosystem file changes. Their `cwd` is the `current` symlink, so each run uses the newest release.
- One scheduler for everything: no crontab and no systemd timers.

**nginx**
- Templates in `deploy/nginx/`, rendered by `deploy/render-nginx.sh <env>`. It runs `envsubst` with an explicit variable list, so nginx's own `$variables` are kept.
  - `housing-locations.conf.template` is the shared part:
    - `/api/` proxies to the API port, sets `X-Forwarded-For $remote_addr`, `X-Forwarded-Proto https` and `Host`, with `proxy_read_timeout 60s` and `client_max_body_size 1m`. Only `/api/v1/housing/bulk` (10 MB JSON) and the photo upload `~ ^/api/v1/housing/[^/]+/photo$` (5 MB) get `11m`, so unauthenticated routes such as login can't be sent large bodies. The API's own limits stay the real check.
    - `/assets/` (Vite hashed files): one year immutable.
    - `/`: `try_files $uri /index.html` (SPA fallback); `index.html` with `no-cache`.
    - The UI security headers come from `ui-headers.conf`, included in every location that sets its own `add_header`, because nginx drops server-level `add_header`s in any location that has one.
  - `housing-box.conf.template` is the server block: `listen 443 ssl` with `http2` on the `listen` line (no `http2 on;` in 1.20), the Cloudflare origin certificate, `include cloudflare.conf`, Authenticated Origin Pulls (`ssl_client_certificate` pointing at Cloudflare's origin-pull CA, `ssl_verify_client on`), and the shared locations. A request that reaches the box without Cloudflare's client certificate is refused during TLS, so the WAF and the login rule can't be bypassed through the origin IP.
  - `cloudflare.conf`:
    - `set_real_ip_from` for each Cloudflare range, plus `real_ip_header CF-Connecting-IP`.
    - `real_ip_recursive off`.
    - The ranges are a dated copy of `https://www.cloudflare.com/ips-v4` and `-v6`; the runbook says how to refresh them, and the ops checklist has a quarterly refresh. They only decide whose `CF-Connecting-IP` is believed; access control is the origin-pull certificate.
  - `local-edge.conf` is a plain `listen 80` server around the same locations, for the compose `edge` service and CI. The API upstream is a render variable (`HOUSING_API_UPSTREAM`): `api:3001` in compose, `127.0.0.1:3001` in CI.
- **UI headers (`ui-headers.conf`)**: HSTS (1 year), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone and geolocation off), and this CSP: `default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'`. The API is on the site's own origin (`/api/v1` on the same vhost), so `PUBLIC_API_URL` = `VITE_API_BASE_URL` = the site origin, and `'self'` covers the photos (C5 note). `blob:` is for the upload previews. The API keeps helmet's headers (`NE-SEC-01`).
- **Production's vhost is not touched** in C6 (R10). The rendered production config is for C7.

**Deploy (`deploy/deploy.sh <env> <ref>`, run as the environment user)**
1. `git fetch` in `repo`, resolve `<ref>` to a sha, and `git worktree add` it into `releases/<sha>`.
2. `npm ci --ignore-scripts` in the root and `server/` (as `scripts/docker-dev-entry.sh` does; `ST-32`), then `node -e "require('sharp')"` in `server/` (C5 note).
3. Build the UI with the values from `build.env` (`npm run build`), and build the server (`npm --prefix server run build`). Each environment gets its own UI build because the values are fixed at build time.
4. Production only: run `deploy/backup.sh` first, so a bad migration has a fresh restore point.
5. `npm --prefix server run db:migrate` with `DATABASE_MIGRATION_URL` from `deploy.env` (`DB-ROLE-01`, `DB-MIG-01`).
6. Switch `current` atomically (`ln -sfn` to a temporary name, then `mv -T`) and run `pm2 startOrReload deploy/ecosystem.config.cjs --only housing-api-<env> --update-env` with `HOUSING_ENV`.
7. Poll `http://127.0.0.1:<port>/api/v1/readyz` for up to 30 s. On failure, point `current` back at the previous release, reload, and exit 1.
8. Keep the last 5 releases.

Migrations are not rolled back automatically. After the first staging run they are add-only and must work with the previous release's code (`DB-MIG-02`), so switching back to the old code is always safe. A destructive migration needs its own plan and a restore point (`DB-MIG-05`).

**Backups and restore**
- **`deploy/backup.sh`**:
  - `pg_dump -Fc` as `housing_owner`, piped through `age -r $AGE_RECIPIENT`, then `aws s3 cp -` to `s3://<backup bucket>/<env>/housing-<UTC timestamp>.dump.age`. No unencrypted dump touches the disk.
  - It exits non-zero on any failure (`set -euo pipefail`), so PM2's log and the uptime monitor's heartbeat (below) show a missed backup.
- **Backup bucket** (user decision: undeletable for 30 days):
  - created with S3 Object Lock, default retention 30 days in governance mode, versioning on, and a lifecycle rule that expires objects (and noncurrent versions) after 30 days;
  - Block Public Access, default SSE-S3 encryption, and a bucket policy denying requests without `aws:SecureTransport`.
  - The box's backup IAM user can only `PutObject` to its own `<env>/` prefix, with explicit denies on `s3:DeleteObject`, `s3:DeleteObjectVersion`, `s3:PutBucketPolicy`, `s3:PutLifecycleConfiguration` and `s3:PutObjectRetention`. Someone who takes over the box can't read or delete old backups, and Object Lock stops an AWS admin mistake from deleting them early.
  - The age private key never lives on the box. Two named people keep it offline.
- **`deploy/restore-drill.sh <env>`** runs on the box during a drill, with the age identity file given by path and deleted afterwards. It:
  - downloads a backup (the latest or a named one) with a short-lived credential the operator supplies for the drill only: an STS session or a temporary IAM key with `s3:GetObject` and `s3:ListBucket` on the backup bucket's `<env>/` prefix, passed through the environment (never `aws configure`, so nothing lands in `~/.aws`) and revoked after the drill;
  - reads the age identity from a file in `/dev/shm` that the script removes on exit (`trap`), so the private key never touches the disk;
  - restores it with `pg_restore` into a scratch database `housing_restore_drill` on the staging cluster;
  - runs `deploy/sql/verify-restore.sql`: row counts per housing table, the serial counters, a check that no record's serial exceeds its counter, and the newest activity-log time;
  - prints the results next to the same counts from the source database, then drops the scratch database.
- **When**: before cutover, then every quarter (own-stack plan).
- **Photo backup**: versioning on the photo buckets, with noncurrent versions expiring after 30 days. A deleted or overwritten object can be restored for 30 days, and a deleted photo is still fully gone after 30 days. There is no second copy of the photos; the NAS switch later gives one.

**Logs and uptime**
- pino JSON to stdout (C1), then PM2's log files, rotated by `pm2-logrotate` per user: 50 MB, 14 files, compressed. The box's existing logrotate handles nginx.
- An external uptime monitor (UptimeRobot free, or Cloudflare health checks) checks every 5 minutes:
  - staging `https://<staging host>/api/v1/readyz` and `/`;
  - a heartbeat URL that `backup.sh` calls after a successful upload, if the monitor supports heartbeats.
- Production's API is monitored from C7, when its vhost goes live.

**Local production-shaped check**
- A compose service `edge` (profile `edge`): `nginx:1.20` serving the built `rest` UI from `dist/` and proxying `/api/` to the `api` service, using `local-edge.conf` and the same `ui-headers.conf`, on `127.0.0.1:8080`.
- A Playwright project `edge-rest` runs the public specs (`e2e/live/`) against it and fails on any `securitypolicyviolation` event, so a CSP that blocks the app fails a test instead of staging.
- CI runs the project in `db-suites`, after `test:e2e:rest`: it builds the UI with `VITE_API_BASE_URL=http://localhost:8080`, then starts `nginx:1.20` with `docker run --network host`, so nginx reaches the background API on `127.0.0.1:3001` (the API binds to loopback, R3). The background API's `ALLOWED_ORIGINS` then also lists `http://localhost:8080`; `PUBLIC_API_URL` stays `http://localhost:3001` for the public-rest run, and photo URLs aren't part of the public specs.

**What the repo automates vs what needs a person**
- **Repo**: CI, the build, migrations, release switching, rollback to the previous release, the sweep and backup schedules, and the nginx and PM2 config.
- **A person** (runbook):
  - installing Node 22, PostgreSQL 17, nginx config, PM2, age and the AWS CLI on the box;
  - users, clusters, `roles.sql` and databases;
  - env files and secrets;
  - S3 buckets and IAM;
  - Cloudflare (SSL Full strict, the origin certificate, a WAF rate rule on `/api/v1/auth/login`);
  - SELinux booleans if it is enforcing;
  - each deploy command, creating admins, the one-time S3 test run, the uptime monitor, restore drills and the quarterly orphan check.

## Implementation units

### U1. Bind the API to loopback and shorten photo caching
- **Goal:** The API listens on `HOST` (default `127.0.0.1`), and photos are cached for one day.
- **Requirements:** R3, R5
- **Files:** `server/src/config.ts`, `server/src/config.test.ts`, `server/src/server.ts`, `server/src/routes/v1/photos.ts`, `server/test/http/photos.test.ts`, `compose.yaml` (`api`: `HOST=0.0.0.0`), `server/.env.example`, `docs/api/API_CONTRACT.md` (photo route cache line, bump the version)
- **Approach:** Add `HOST` to the zod schema next to `PORT` (`z.string().min(1).default('127.0.0.1')`), and pass it to `app.listen(config.PORT, config.HOST, …)`. Change the photo route's header to `public, max-age=86400`. In `.env.example`, set `TRUST_PROXY` to 1 for the box (Cloudflare + nginx, with nginx overwriting `X-Forwarded-For`), and show AWS S3 values instead of R2.
- **Tests:**
  - Config: the default is `127.0.0.1`, an explicit `0.0.0.0` is kept, and an empty value is refused.
  - Photo route: `Cache-Control` is exactly `public, max-age=86400` and has no `immutable`.
  - Compose: `docker compose up -d db api`, then `curl localhost:3001/api/v1/readyz` from the host still answers 200.
- **Done when:** Server tests pass, and the compose API still answers from the host.
- **Depends on:** none
- **Status:** done

### U2. Per-admin write rate limit
- **Goal:** Each admin gets at most 120 writes a minute; the next one gets 429 `RATE_LIMITED`.
- **Requirements:** R4
- **Files:** `server/src/routes/v1/housing-admin.ts`, `server/src/app.ts` (a `writeRateLimit` option, like the read and photo ones), `server/test/http/housing-writes.test.ts`, `docs/api/API_CONTRACT.md` (429 on writes), `server/src/openapi.ts` (429 on the admin write operations, if the drift test asks for it)
- **Approach:**
  - Follow the read limiter in `server/src/routes/v1/housing.ts:36-50` and the login limiter's error mapping in `auth.ts:32-45`: `express-rate-limit`, with `keyGenerator: (req) => req.admin!.id` written so it narrows instead of using `!`.
  - Export `DEFAULT_WRITE_RATE_LIMIT = { windowMs: 60_000, limit: 120 }` like `DEFAULT_READ_RATE_LIMIT`, and pass `writeRateLimit` from `createApp` to `housingAdminRouter`.
  - In the router-level guard (line 69), for non-safe methods: run `requireAdmin` first (so an unauthenticated write stays 401), then the limiter, except when `req.path === '/activity'` (the UI logs its own events through it). The guard runs before the bulk JSON parser and the multipart parser, so the bulk and photo routes are covered.
  - When an admin hits the limit, log one `warn` line with the admin id (never the session), so a runaway session shows in the logs.
- **Tests:**
  - With the limit at 3: three writes pass and the fourth gets 429 `RATE_LIMITED` with the contract error body.
  - A second admin is still allowed (the key is per admin, not per IP).
  - GETs are never counted.
  - An unauthenticated write is still 401, not 429.
  - The over-limit write leaves no activity-log row and no change.
  - A bulk request counts as one.
- **Done when:** Server tests and `test:contract:rest` pass.
- **Depends on:** none
- **Status:** done

### U3. GitHub Actions CI
- **Goal:** Every push and pull request runs the full suite against PostgreSQL 17 and reports one pass or fail.
- **Requirements:** R1, R2
- **Files:** `.github/workflows/ci.yml`, `.github/dependabot.yml`, `server/db/docker-init/01-init.sh` (take `ROLES_SQL` with default `/housing/roles.sql`, and `PGUSER` defaulting to `$POSTGRES_USER`, so CI can run it against the service container with `PGHOST=127.0.0.1 PGUSER=postgres PGPASSWORD=<service password>` plus `HOUSING_OWNER_PASSWORD=housing_owner_local HOUSING_APP_PASSWORD=housing_app_local`; the compose path keeps working unchanged), `compose.yaml` only if the init script's interface changes
- **Approach:**
  - Build the jobs from Technical decisions → CI. Use `actions/setup-node` with `node-version-file: .nvmrc` and the npm cache for both lockfiles (`cache-dependency-path`).
  - `permissions: contents: read`, and `concurrency` with cancel-in-progress per ref.
  - Pin third-party actions to full commit SHAs, with the version in a comment.
  - The `deploy-config` job is added in U5, once the files exist.
  - Fix whatever the first CI run shows, such as a high `npm audit` finding: either fix it, or document it in this plan's Notes with a reason (`ST-31`).
- **Tests:**
  - The workflow passes on a push of this branch.
  - Break one contract assertion locally on a throwaway commit (never pushed to main) or confirm from a red run that a failing step fails the job.
  - `docker compose down -v && docker compose up -d db` still creates both databases with the changed init script.
- **Done when:** A green run of `ci.yml` on `migrate/c6-deploy`, and the compose database still initializes.
- **Depends on:** U1, U2, U7 (so CI covers the new tests and the audit is clean)
- **Status:** in progress (workflow written and linted; a green run needs the branch pushed)

### U4. PM2 ecosystem, deploy, backup and restore-drill scripts
- **Goal:** The box runs the API, sweep and backup from one ecosystem file, and one command deploys or rolls back a release.
- **Requirements:** R6, R7, R8
- **Files:** `deploy/ecosystem.config.cjs`, `deploy/deploy.sh`, `deploy/backup.sh`, `deploy/restore-drill.sh`, `deploy/sql/verify-restore.sql`, `deploy/README.md` (a short pointer to the runbook)
- **Approach:**
  - Follow Technical decisions → Box layout, PM2, Deploy, and Backups and restore.
  - All scripts: `#!/usr/bin/env bash`, `set -euo pipefail`, required variables checked up front with a clear message, and no secret echoed or passed as an argument (`NE-CFG-03`). `pg_dump` reads the password from the URL in the env file, and `aws` reads keys from the environment.
  - `deploy.sh` reads `build.env` for the build only, and sources `deploy.env` in a subshell for the backup and migrate steps only, so the owner URL never reaches the build or PM2's environment.
  - The sweep app runs `node --env-file=/etc/housing/<env>/api.env server/dist/cli/files-sweep.js`. Check that the build emits it; `server/package.json`'s `files:sweep` uses `tsx`, which is a dev dependency.
- **Tests:**
  - `node -e` loads the ecosystem with `HOUSING_ENV=staging`, `production` and unset. It gives the expected app names, ports, cron strings and `kill_timeout`, and throws on unset or unknown.
  - `shellcheck` is clean.
  - `verify-restore.sql` runs against the local dev database through `psql` in the compose `db` container and prints counts and counters.
  - A local dry run of `backup.sh` with a fake `aws` on `PATH` (writes stdin to a file) and a throwaway age key: the file decrypts with `age -d` and `pg_restore --list` reads it.
  - `restore-drill.sh` against that file restores into `housing_restore_drill` on the compose database, matches the source counts, and drops the scratch database.
- **Done when:** The ecosystem checks, shellcheck, and the local backup → restore-drill round trip pass.
- **Depends on:** U1
- **Status:** done

### U5. nginx templates and the local edge
- **Goal:** One set of nginx 1.20 templates serves the UI with its security headers and proxies `/api/`, checked locally and in CI.
- **Requirements:** R3, R6
- **Files:** `deploy/nginx/housing-locations.conf.template`, `deploy/nginx/housing-box.conf.template`, `deploy/nginx/cloudflare.conf`, `deploy/nginx/ui-headers.conf`, `deploy/nginx/local-edge.conf`, `deploy/render-nginx.sh`, `compose.yaml` (`edge` service, profile `edge`), `playwright.config.ts` (project `edge-rest`, registered only when `E2E_EDGE_URL` is set, like `public-rest`), `e2e/support/test.ts` (fail on `securitypolicyviolation`, only on that project), `package.json` (`test:e2e:edge`), `.github/workflows/ci.yml` (`deploy-config` job, and the edge step in `db-suites`)
- **Approach:**
  - Follow Technical decisions → nginx and Local production-shaped check.
  - nginx 1.20 syntax only: `http2` on the `listen` line, no `http2 on;`, no `quic`.
  - The CSP violation hook adds a listener with `page.addInitScript` and exposes violations through `page.exposeFunction`. The test fails in `afterEach` if any were seen.
- **Tests:**
  - CI's `nginx -t` in `nginx:1.20` passes for the staging and production renders and for `local-edge.conf`.
  - Through the edge (`curl -I`):
    - `/` and a deep link like `/housing/semi-pucca` return `index.html` with the CSP, HSTS, `nosniff` and `Referrer-Policy` headers;
    - `/assets/*.js` is immutable;
    - `/api/v1/readyz` is 200 through the proxy;
    - a photo URL gets `max-age=86400`.
  - The API log shows the client IP that nginx sent.
  - With `TRUST_PROXY=1` behind the edge, a spoofed `X-Forwarded-For` from the client doesn't change `req.ip`: nginx overwrites it. Check it in the access log or with the login limiter.
  - `npm run test:e2e:edge` passes the public specs with no CSP violation.
  - A deliberately broken CSP (`img-src 'none'`, local only) makes it fail.
- **Done when:** `nginx -t` passes in CI, the curl checks pass, and `test:e2e:edge` is green locally and in CI.
- **Depends on:** U1, U3
- **Status:** done

### U6. Runbook and doc updates
- **Goal:** A person with box, AWS and Cloudflare access can set up staging and production, deploy, roll back and run a restore drill from the docs alone.
- **Requirements:** R9, R10
- **Files:**
  - `docs/operations/runbook.md` (new);
  - `docs/architecture/migration-notes.md`: Decision 5 (deploy, backups and limits); Decisions 3 and 4 updated for the one-day cache and the write limit; the add-only rule after the first staging run;
  - `docs/testing/README.md`: CI section, `test:e2e:edge`, the S3 one-time run;
  - the roadmap: C6 row marked done, both open questions answered;
  - `README.md`: one line pointing to the runbook.
- **Approach:** The runbook follows the order a person would work in, with copy-paste commands for the RHEL 9 family. nginx 1.20.1 is the RHEL 9 AppStream version; the runbook says to confirm the OS first, with Ubuntu notes where commands differ. Sections:
  1. Box prerequisites: Node 22, PostgreSQL 17 from PGDG, PM2 and `pm2-logrotate`, age, the AWS CLI v2, git.
  2. Users and directories.
  3. PostgreSQL:
     - the two clusters and their ports, `listen_addresses`, `pg_hba`;
     - `roles.sql` with generated passwords (`openssl rand -base64 32`);
     - `create database` and the grants as in `01-init.sh`.
  4. AWS:
     - buckets `<org>-housing-photos-staging`, `-prod` and `<org>-housing-backups`;
     - Block Public Access, default SSE-S3 encryption, versioning and lifecycle;
     - IAM users with JSON policies, one key pair per environment: app per environment (`s3:GetObject`, `s3:PutObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`, plus `s3:ListBucket` on the bucket itself, because without it S3 answers a missing key with 403 instead of 404 and the photo route turns that into a 500; no version deletion, no bucket-policy or lifecycle actions), backup writer (PutObject on its own prefix), drill reader (kept off the box);
     - a bucket policy on every bucket denying requests without `aws:SecureTransport`;
     - checks with `aws s3api get-public-access-block` and `get-bucket-encryption` (`NS-40`, `NS-43`).
  5. Env files: every variable with its staging and production value pattern. `PUBLIC_API_URL` must be final before the first upload.
  6. age key pair: generate offline, put only the recipient on the box.
  7. nginx: render, install, `nginx -t`, reload; SELinux `httpd_can_network_connect` and the file context on `/srv/housing/*/current/dist`.
  8. Cloudflare:
     - SSL Full (strict) and the origin certificate;
     - Authenticated Origin Pulls on, and the origin-pull CA installed for `ssl_client_certificate`; check that a direct `curl --resolve` to the box IP is refused;
     - a WAF rate rule on `/api/v1/auth/login`, verified by tripping it once from a test client;
     - refreshing the IP list.
  9. PM2: `pm2 startup`, first `startOrReload`, `pm2 save`, logrotate settings.
  10. First deploy, then create the admins with the built CLI: `node --env-file=/etc/housing/<env>/deploy.env server/dist/cli/admin.js create …` (`admin.ts` connects as the owner through `DATABASE_MIGRATION_URL`, which only `deploy.env` holds).
  11. One-time S3 test run with `TEST_S3_*` against a test bucket.
  12. Uptime monitor and backup heartbeat.
  13. Routine deploy and rollback, including rolling back to a named release.
  14. Restore drill.
  15. Quarterly orphan check.
  16. Production in C6: prepare only, don't touch the vhost (R10).
  17. An ops checklist with checkboxes covering every C1–C5 "for C6" note.
  18. Secret rotation: how to change the two database passwords, the app and backup AWS keys, and the age key pair, and when (a person leaves, a suspected leak, yearly).
- **Tests:** None automated. A read-through against the scripts: every variable the scripts and `config.ts` need is in the env-file section, and every command names a real script or path.
- **Done when:** The runbook covers each item above, and the other docs are updated.
- **Depends on:** U4, U5
- **Status:** done

### U7. Replace `xlsx` 0.18.5 with SheetJS 0.20.3
- **Goal:** The admin import reads `.xlsx` and `.csv` files exactly as before, on a SheetJS version with no open high advisories.
- **Requirements:** R11
- **Files:** `package.json`, `package-lock.json`, `src/features/housing/utils/importParse.ts` (only if the API changed), its tests
- **Approach:**
  - SheetJS publishes fixed versions only on its own CDN, not on npm. Install `xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`; the lockfile pins the tarball's integrity hash (`ST-21`).
  - Check the tarball for install scripts before installing (`ST-32`), and say in the commit message why the dependency comes from a URL (`ST-30`).
  - Keep the import's behavior; adapt `importParse.ts` only if a call it uses changed between 0.18 and 0.20.
- **Tests:**
  - The existing `importParse` unit tests pass.
  - The bulk import e2e specs pass on mock and `admin-rest` (`.xlsx` and `.csv` files, the invalid-row case).
  - `npm audit --omit=dev --audit-level=high` in the root reports 0 vulnerabilities.
  - `check:prod-bundle` still passes.
- **Done when:** The audit is clean, and the import tests and e2e specs are green.
- **Depends on:** none
- **Status:** done

## Verification
- `npm run lint`, `npm run build`, `npm --prefix server run typecheck`, `npm run i18n-check`
- `npm test`, `npm run check:prod-bundle`
- One after another: `npm --prefix server test`, `npm run test:contract:rest`, `npm run test:e2e:rest-admin`
- `docker compose up -d db api` with the dev seed, then `npm run test:e2e:rest`
- `docker compose --profile edge up -d` with a `rest` build, then `npm run test:e2e:edge`
- `npm run test:e2e:mock`
- `npm audit --omit=dev --audit-level=high` in the root and `server/`
- `shellcheck deploy/*.sh`, and `nginx -t` through `docker run nginx:1.20`
- A green `ci.yml` run on the pushed branch (pushing needs the user's go-ahead)

All server commands run with Node 22: `PATH=~/.nvm/versions/node/v22.20.0/bin:$PATH`.

## Risks and rollback
- **CI cost or flakiness**: the Playwright suites take minutes. The jobs run in parallel except the serial `housing_test` steps. A flaky spec is fixed, never retried into green (`TS-15`).
- **The CSP blocks something on staging**: `edge-rest` catches it first. If staging still breaks, switch the header in `ui-headers.conf` on the box to `Content-Security-Policy-Report-Only` and reload nginx while the fix goes through the repo. Don't remove it.
- **A bad release**: `deploy.sh` switches back automatically when `readyz` fails. Otherwise, run `deploy.sh <env> <previous sha>`, or relink `current` and reload (runbook).
- **A bad migration**: migrations are add-only after the first staging run. Production takes a backup right before migrating, and the restore drill script restores it.
- **The box's other 23 vhosts**: every nginx change runs `nginx -t` before the reload, and the templates are tested against nginx 1.20 in CI.
- **The write limit stops a legitimate import**: 120 a minute is about 24,000 rows a minute at the UI's batch size, so this is unlikely. The limit is one constant to raise.

## Notes for later chunks
- C7: render and install the production vhost from `housing-box.conf.template` (it replaces the Supabase UI's server block), build the production UI with `rest`, and add production's `readyz` to the uptime monitor.
- C7: `VITE_API_BASE_URL` and `PUBLIC_API_URL` are both the site origin, so the photo URLs written by the import are `https://<prod host>/api/v1/photos/<id>`.
- C7: run the restore drill on a fresh production backup before the final cutover step.
- C7: check the activity-log filters at real volume; add the `project_type` and `actor_email` indexes if they show up.
- NAS switch: add a `list` operation with the `NS-50` copy script, and an orphan sweep then if the quarterly check finds orphans.

## Definition of done
- All units done and their tests pass
- Verification commands pass
- `ae-review` has run, with no open P0 or P1
- Code from abandoned attempts is removed

## Progress
- **Branch:** `migrate/c6-deploy`
- **Updated:** 2026-10-06 09:55
- **Next:** ae-test (full), then simplify and review; U3's green CI run waits on a push
- **Uncommitted:** none
- **Notes:**
  - Unit order: U1, U2, U7, U3, U4, U5, U6 (U3 depends on U7 for a clean audit).
  - U3: `ci.yml` passes actionlint (with shellcheck), and both `01-init.sh` paths were checked on throwaway containers (compose mount, and CI-style `PG*` variables). The plan's "green run" check waits on a push, which needs the user's yes. Actions pinned: checkout v7.0.1, setup-node v7.0.0, cache v6.1.0, upload-artifact v7.0.1.
  - U4 checks run in containers (the box is Linux; `mv -T` and `find -printf` are GNU-only):
    - backup → restore-drill round trip on postgres:17 with a fake `aws` and a throwaway age key;
    - `deploy.sh` with real PM2 on node:22: a good release went live, a broken one rolled back (exit 1, API still ready), and a redeploy skipped the build;
    - `verify-restore.sql` exits 3 when a serial is above its counter. psql's `\quit` takes no exit code, so the check raises an exception instead.
  - U5 as built:
    - File names: `box.conf.template` and `local.conf.template` (not `housing-box…`/`local-edge.conf`). `api-proxy.conf.template` holds the shared proxy lines.
    - Each environment's upstream is `housing_api_<env>`, because upstream names are global across the box's vhosts.
    - `npm run build:edge` builds the rest UI into `.edge/dist` (gitignored).
    - Checks:
      - `nginx -t` passed on 1.20 with staging, production and local loaded together;
      - curl confirmed the headers, the SPA fallback, immutable assets, the one-day photo cache, 413 for a 2 MB login body, and that a spoofed `X-Forwarded-For` is replaced by the client IP;
      - `edge-rest` was green on a fresh seeded database (17 passed, 2 skipped), and a `connect-src 'none'` CSP made it fail.
    - The local dev database's C5 photos have `http://localhost:3001` URLs, so `edge-rest` correctly flags them as cross-origin. The local edge run needs a fresh seed; CI's seed has none.
  - U6: the restore drill was re-run as a plain `createdb` role (`housing_drill`, as the runbook sets up), not the superuser, and passed. The runbook sets the role passwords through `printf` piped into psql, so they never appear in `ps`.
  - The deploy script runs from the repo clone's working tree, so the runbook updates that tree before each deploy.
  - `npm ci` runs with `--ignore-scripts` per command, not through `NPM_CONFIG_IGNORE_SCRIPTS`, which would also skip pre/post scripts on `npm run`.
