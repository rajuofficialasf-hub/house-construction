# Housing API: operations runbook

Everything a person does on the organization box, in AWS and in Cloudflare to run the housing API and UI. The repo automates the rest: CI, the build, migrations, switching releases, rollback, and the sweep and backup schedules ([../../deploy/README.md](../../deploy/README.md)).

- Plan: [../plans/2026-10-06-0925-migrate-c6-deploy-plan.md](../plans/2026-10-06-0925-migrate-c6-deploy-plan.md).
- Picture: "Deployment (C6)" in [../diagrams/backend-architecture.md](../diagrams/backend-architecture.md).

**Until the cutover, production stays on Supabase.** For production, C6 only prepares:
- the database;
- the env files;
- the API process, on loopback only;
- the photo bucket and the backups.

Don't touch production's nginx vhost, its DNS or its UI build before the cutover. Section 16 lists what to do for production before it; section 19 is the cutover itself, with its checklist in section 20.

Commands are for the RHEL 9 family: the box runs nginx 1.20.1, which is the RHEL 9 AppStream version. Run `cat /etc/os-release` first; Ubuntu differences are noted where they matter. `<env>` is `staging` or `production`; `<host>` is that environment's hostname. Fill in `<region>` and `<org>`.

| | staging | production |
|---|---|---|
| Linux user | `housing-staging` | `housing-prod` |
| Directory | `/srv/housing/staging` | `/srv/housing/production` |
| Env files | `/etc/housing/staging/` | `/etc/housing/production/` |
| PostgreSQL 17 cluster | port 5433 | port 5432 |
| API (loopback only) | `127.0.0.1:3101` | `127.0.0.1:3201` |
| PM2 apps | `housing-api-staging`, `housing-sweep-staging`, `housing-backup-staging` | the same with `-production` |
| Photo bucket | `<org>-housing-photos-staging` | `<org>-housing-photos-production` |
| Backups | `s3://<org>-housing-backups/staging/` | `s3://<org>-housing-backups/production/` |

---

## 1. Box prerequisites

As root:

```sh
dnf install -y git gettext age     # gettext gives envsubst for render-nginx.sh
dnf module install -y nodejs:22    # or NodeSource; check: node -v → v22.x
npm install -g pm2
# AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
```

- PostgreSQL 17 comes from the PGDG repository: https://www.postgresql.org/download/linux/redhat/. Install `postgresql17-server` and `postgresql17-contrib` (migration 0010 needs its `pg_trgm`).
- If `age` isn't packaged, use the release binary from https://github.com/FiloSottile/age/releases.

## 2. Users and directories

```sh
useradd --system --create-home housing-staging
useradd --system --create-home housing-prod
for pair in staging:housing-staging production:housing-prod; do
  env=${pair%%:*}; user=${pair##*:}
  install -d -o "$user" -g "$user" -m 711 /srv/housing/$env /srv/housing/$env/releases
  install -d -o "$user" -g "$user" -m 700 /etc/housing/$env
done
chmod 711 /srv/housing
```

- The `711` lets nginx walk to `current/dist` without listing anything.
- The release files are created with the default umask, so nginx can read the built UI.
- Clone the repo as each user. If the repo is private, use a read-only deploy key.

```sh
sudo -u housing-staging git clone https://github.com/rajuofficialasf-hub/house-construction.git /srv/housing/staging/repo
sudo -u housing-prod    git clone https://github.com/rajuofficialasf-hub/house-construction.git /srv/housing/production/repo
```

## 3. PostgreSQL: one cluster per environment

The migrations grant to the fixed role names `housing_owner` and `housing_app`. Separate clusters keep staging's passwords from opening production's data.

**Create the clusters.** Production uses the default service; staging gets a copy of it:

```sh
/usr/pgsql-17/bin/postgresql-17-setup initdb
cp /usr/lib/systemd/system/postgresql-17.service /etc/systemd/system/postgresql-17-staging.service
# In the copy, set: Environment=PGDATA=/var/lib/pgsql/17/staging/
systemctl daemon-reload
/usr/pgsql-17/bin/postgresql-17-setup initdb postgresql-17-staging
```

**Configure each cluster.**
- In its `postgresql.conf`, set:

  ```
  listen_addresses = 'localhost'
  port = 5432            # 5433 for staging
  password_encryption = scram-sha-256
  ```

- In its `pg_hba.conf`, keep the local `postgres` peer line and allow only these (DB-ROLE-03):

  ```
  host  housing                         housing_owner,housing_app  127.0.0.1/32  scram-sha-256
  host  housing                         housing_owner,housing_app  ::1/128       scram-sha-256
  # staging cluster only, for the restore drill (section 14):
  host  postgres,housing_restore_drill  housing_drill              127.0.0.1/32  scram-sha-256
  ```

- Then start both:

  ```sh
  systemctl enable --now postgresql-17 postgresql-17-staging
  ```

**Roles and database, once per cluster.**
- The passwords are hex, so they are safe in URLs.
- `printf` is a shell builtin, so they never appear in `ps`.
- Keep them only in the env files (section 5).

```sh
umask 077
PORT=5432   # 5433 for staging
OWNER_PW=$(openssl rand -hex 32); APP_PW=$(openssl rand -hex 32)
{ printf '\\set owner_password %s\n\\set app_password %s\n' "$OWNER_PW" "$APP_PW"; cat /srv/housing/production/repo/server/db/roles.sql; } \
  | sudo -u postgres psql -p $PORT -d postgres
sudo -u postgres psql -p $PORT -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create database housing owner housing_owner;
revoke all on database housing from public;
grant connect, temporary on database housing to housing_app;
SQL
echo "owner: $OWNER_PW"; echo "app: $APP_PW"   # copy into the env files, then clear the terminal
```

For staging, also create the drill role:

```sh
sudo -u postgres psql -p 5433 -d postgres -c "create role housing_drill login createdb"
sudo -u postgres psql -p 5433 -d postgres -c '\password housing_drill'
```

The migrations run with the first deploy (section 10). Once they have run on staging, they are add-only: never edit or remove a migration that has run there. Add a new one (`DB-MIG-02`, [../architecture/migration-notes.md](../architecture/migration-notes.md)).

## 4. AWS: buckets and IAM

**Photo buckets**, one per environment. Every command is for `<org>-housing-photos-<env>`:

```sh
B=<org>-housing-photos-staging
aws s3api create-bucket --bucket $B --region <region> --create-bucket-configuration LocationConstraint=<region>
aws s3api put-public-access-block --bucket $B --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket $B --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-versioning --bucket $B --versioning-configuration Status=Enabled
aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration \
  '{"Rules":[{"ID":"old-versions-30d","Status":"Enabled","Filter":{},"NoncurrentVersionExpiration":{"NoncurrentDays":30},"Expiration":{"ExpiredObjectDeleteMarker":true}}]}'
```

- Versioning keeps a deleted or replaced photo restorable for 30 days. After that it is gone for good.
- There is no other photo copy until the NAS switch.

**Backup bucket**, shared by both environments with one prefix each.
- It is created with Object Lock, so no one, an AWS admin included, can delete a backup in its first 30 days.
- The lifecycle rule then expires it.

```sh
B=<org>-housing-backups
aws s3api create-bucket --bucket $B --region <region> --create-bucket-configuration LocationConstraint=<region> --object-lock-enabled-for-bucket
aws s3api put-object-lock-configuration --bucket $B --object-lock-configuration \
  '{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"GOVERNANCE","Days":30}}}'
aws s3api put-public-access-block --bucket $B --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
aws s3api put-bucket-encryption --bucket $B --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
aws s3api put-bucket-lifecycle-configuration --bucket $B --lifecycle-configuration \
  '{"Rules":[{"ID":"backups-30d","Status":"Enabled","Filter":{},"Expiration":{"Days":31},"NoncurrentVersionExpiration":{"NoncurrentDays":1}}]}'
```

**Every bucket gets a TLS-only bucket policy.** Put the bucket's name in `<bucket>`:

```json
{"Version":"2012-10-17","Statement":[{"Sid":"TlsOnly","Effect":"Deny","Principal":"*","Action":"s3:*",
  "Resource":["arn:aws:s3:::<bucket>","arn:aws:s3:::<bucket>/*"],"Condition":{"Bool":{"aws:SecureTransport":"false"}}}]}
```

**IAM users**, each with its own access key. No user gets `s3:*`, version deletion, or bucket policy or lifecycle actions (`NS-43`).

`housing-app-<env>` is the API. Its keys go in `api.env`.

```json
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":["s3:GetObject","s3:PutObject","s3:DeleteObject"],"Resource":"arn:aws:s3:::<org>-housing-photos-<env>/*"},
  {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::<org>-housing-photos-<env>"}]}
```

- `ListBucket` is there so that S3 answers a missing key with 404. Without it S3 answers 403, and the photo route turns that into a 500.
- The quarterly orphan check (section 15) also uses it.

`housing-backup-<env>` is `backup.sh`. Its keys go in `deploy.env`.

```json
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":"s3:PutObject","Resource":"arn:aws:s3:::<org>-housing-backups/<env>/*"},
  {"Effect":"Deny","Action":["s3:DeleteObject","s3:DeleteObjectVersion","s3:PutObjectRetention","s3:BypassGovernanceRetention",
    "s3:PutBucketPolicy","s3:PutLifecycleConfiguration","s3:PutBucketObjectLockConfiguration"],"Resource":["arn:aws:s3:::<org>-housing-backups","arn:aws:s3:::<org>-housing-backups/*"]}]}
```

`housing-drill-reader` is for restore drills only. It has no access key until a drill (section 14). Never put it on the box for longer than the drill.

```json
{"Version":"2012-10-17","Statement":[
  {"Effect":"Allow","Action":"s3:GetObject","Resource":"arn:aws:s3:::<org>-housing-backups/*"},
  {"Effect":"Allow","Action":"s3:ListBucket","Resource":"arn:aws:s3:::<org>-housing-backups"}]}
```

**Check each bucket:**

```sh
aws s3api get-public-access-block --bucket <bucket>   # all four true
aws s3api get-bucket-encryption --bucket <bucket>     # AES256
aws s3api get-bucket-versioning --bucket <bucket>     # Enabled
aws s3api get-object-lock-configuration --bucket <org>-housing-backups   # GOVERNANCE, 30 days
```

## 5. Env files

Each file is owned by the environment's user, with mode 600 (`chown housing-staging: … && chmod 600 …`). The VITE values are public: they end up in the browser bundle.

**`/etc/housing/<env>/api.env`** is the API and the sweep, loaded by Node's `--env-file`.
- Leave out `HOST`, `PORT` and `NODE_ENV`; the PM2 file sets them.
- The values come from `server/src/config.ts` and `server/.env.example`.

```sh
LOG_LEVEL=info
# Cloudflare → nginx → API. nginx restores the client IP and overwrites X-Forwarded-For.
TRUST_PROXY=1
DATABASE_URL=postgres://housing_app:<app pw>@127.0.0.1:5433/housing?sslmode=disable   # 5432 on production
ALLOWED_ORIGINS=https://<host>
PUBLIC_READ_ORIGINS=
COOKIE_SECURE=true
# The site's own origin: the API is /api/v1 on the same vhost. Final before the first upload,
# because photo URLs are stored with it.
PUBLIC_API_URL=https://<host>
STORAGE_DRIVER=s3
S3_BUCKET=<org>-housing-photos-<env>
S3_REGION=<region>
AWS_ACCESS_KEY_ID=<housing-app-<env> key>
AWS_SECRET_ACCESS_KEY=<housing-app-<env> secret>
```

**`/etc/housing/<env>/build.env`** holds only the UI build values.

```sh
# staging
VITE_HOUSING_BACKEND=rest
VITE_API_BASE_URL=https://<host>
# production until the cutover (section 19.4 switches it to the two rest lines above):
# the current Supabase values (the anon key is public)
# VITE_HOUSING_BACKEND=supabase
# VITE_SUPABASE_URL=https://<project>.supabase.co
# VITE_SUPABASE_ANON_KEY=<anon key>
```

**`/etc/housing/<env>/deploy.env`** is used only by migrations, `backup.sh` and the admin CLI. Never by the build or the API.

```sh
DATABASE_MIGRATION_URL=postgres://housing_owner:<owner pw>@127.0.0.1:5433/housing?sslmode=disable   # 5432 on production
BACKUP_BUCKET=<org>-housing-backups
AGE_RECIPIENT=<age public key, section 6>
AWS_ACCESS_KEY_ID=<housing-backup-<env> key>
AWS_SECRET_ACCESS_KEY=<housing-backup-<env> secret>
AWS_DEFAULT_REGION=<region>
BACKUP_HEARTBEAT_URL=<optional, section 12>
```

## 6. The backup key pair (age)

On an admin's own computer, never on the box:

```sh
age-keygen -o housing-backups.key   # prints "Public key: age1…"
```

- The public key (`age1…`) is `AGE_RECIPIENT` in both `deploy.env` files.
- The private key file is the only way to read a backup. Keep two copies offline with two named people, for example in the org password manager and on an encrypted USB drive.
- Losing it makes every backup useless.

## 7. nginx (staging now; production at the cutover, section 19.4)

Render the vhost, install it, test it, reload:

```sh
cd /srv/housing/staging/repo
HOUSING_SERVER_NAME=<host> deploy/render-nginx.sh staging /tmp/housing-nginx-staging
sudo install -d -m 755 /etc/nginx/housing/staging
sudo cp /tmp/housing-nginx-staging/* /etc/nginx/housing/staging/
# Cloudflare origin certificate for <host> (section 8):
sudo install -m 644 origin.pem /etc/nginx/housing/staging/origin.pem
sudo install -m 600 origin.key /etc/nginx/housing/staging/origin.key
# Cloudflare's origin-pull CA, once per box:
sudo curl -fsSo /etc/nginx/housing/cloudflare-origin-pull-ca.pem https://developers.cloudflare.com/ssl/static/authenticated_origin_pull_ca.pem
echo 'include /etc/nginx/housing/staging/housing.conf;' | sudo tee /etc/nginx/conf.d/housing-staging.conf
sudo nginx -t && sudo systemctl reload nginx   # never reload without a passing nginx -t: 23 other vhosts share this nginx
```

- Re-render and copy the files whenever `deploy/nginx/` changes.
- The vhost serves `/srv/housing/staging/current/dist`, so a deploy needs no nginx reload.

**SELinux**: if `getenforce` says `Enforcing`:

```sh
setsebool -P httpd_can_network_connect 1   # nginx → the API on 127.0.0.1
semanage fcontext -a -t httpd_sys_content_t '/srv/housing(/.*)?'
restorecon -R /srv/housing
```

Ubuntu has no SELinux. The vhost goes in `sites-available`, linked from `sites-enabled`, instead of `conf.d`.

## 8. Cloudflare

For the staging hostname now, and production's the day before the cutover (section 19.4):

1. Add a DNS record for `<host>`, proxied (orange cloud), pointing at the box.
2. Set SSL/TLS to **Full (strict)**, and turn on **Always Use HTTPS**.
3. Under SSL/TLS → Origin Server, create an origin certificate for `<host>`. Install it as `origin.pem` and `origin.key` (section 7).
4. Under SSL/TLS → Origin Server, turn on **Authenticated Origin Pulls**. nginx then accepts only Cloudflare's client certificate (`ssl_verify_client on`). Check it from outside Cloudflare:

   ```sh
   curl -sk --resolve <host>:443:<box ip> https://<host>/ | head -3   # 400 "No required SSL certificate was sent"
   curl -s https://<host>/api/v1/readyz                              # {"data":{"status":"ok"}}
   ```

   The zone setting uses Cloudflare's shared certificate. For a certificate only this zone holds, use per-hostname origin pulls with your own certificate.
5. Under Security → WAF, add a rate limiting rule:
   - when: URI path equals `/api/v1/auth/login` and the method is `POST`;
   - limit: 20 requests per 10 seconds per IP;
   - action: block for 10 minutes.

   The API has its own login limit (10 failures per IP per 15 minutes), but it lives in memory and resets on every deploy. This rule doesn't. Check it once from a test machine:

   ```sh
   for i in $(seq 1 25); do curl -s -o /dev/null -w '%{http_code} ' -X POST -H 'content-type: application/json' -d '{}' https://<host>/api/v1/auth/login; done
   # ends in 429 from Cloudflare
   ```

**Refreshing Cloudflare's IP ranges.** Quarterly, and whenever Cloudflare announces a change, compare `deploy/nginx/cloudflare.conf` with https://www.cloudflare.com/ips-v4 and https://www.cloudflare.com/ips-v6. Update the file in a pull request, then re-render and reload (section 7). The list only decides whose `CF-Connecting-IP` is believed; the origin-pull certificate decides who can connect.

## 9. PM2

As each environment user (`sudo -iu housing-staging`):

```sh
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
pm2 set pm2-logrotate:compress true
pm2 startup systemd   # prints a command; run that one as root
```

- The API logs pino JSON to stdout, and PM2 writes it to `~/.pm2/logs/`.
- Read it with `pm2 logs housing-api-staging`.
- nginx's own logs are in `/var/log/nginx/housing-<env>.*.log`, rotated by the box's logrotate.

## 10. First deploy and admins

As the environment user. The deploy script runs from the clone's working tree, so update the tree first:

```sh
cd /srv/housing/staging/repo
git fetch origin && git checkout --detach origin/main
deploy/deploy.sh staging main   # any branch, tag or sha
```

It builds the ref in `releases/<sha>`, migrates, points `current` at it, starts or reloads the API and waits for `/api/v1/readyz`.

Then start the two nightly jobs once and save the process list. PM2 runs a cron app once whenever it is started, so the first backup and sweep run now:

```sh
cd /srv/housing/staging/current
HOUSING_ENV=staging pm2 start deploy/ecosystem.config.cjs --only housing-sweep-staging,housing-backup-staging
pm2 save
pm2 logs housing-backup-staging --lines 5 --nostream   # "backup: uploaded s3://…"
```

Start them again only when `deploy/ecosystem.config.cjs` changes. Their `cwd` is `current`, so every run uses the newest release.

**Admins (staging).** There is no signup. The CLI prompts for the password; it never takes it as an argument:

```sh
cd /srv/housing/staging/current
node --env-file=/etc/housing/staging/deploy.env server/dist/cli/admin.js create --email <email> --name <name>
node --env-file=/etc/housing/staging/deploy.env server/dist/cli/admin.js list
```

Production's admins are imported at the cutover with their Supabase passwords (section 19); after it, they are managed with this CLI like staging's.

## 11. One-time S3 test run

The S3 driver's contract and smoke tests skip without a bucket, and there is no local S3. Run them once against a test bucket, never a real one:
1. Create `<org>-housing-photos-test` with the photo-bucket settings (section 4).
2. Create a temporary IAM user with the app policy for that bucket.
3. On a developer machine, with `docker compose up -d db`:

   ```sh
   TEST_S3_BUCKET=<org>-housing-photos-test TEST_S3_REGION=<region> \
   AWS_ACCESS_KEY_ID=<test key> AWS_SECRET_ACCESS_KEY=<test secret> \
   npm --prefix server test
   # the S3 storage tests must run, not skip
   ```

4. Delete the test user's key and empty the test bucket afterwards.

## 12. Uptime monitor and backup heartbeat

- **Uptime**: in UptimeRobot (free), or Cloudflare health checks, add HTTPS monitors every 5 minutes for:
  - `https://<host>/api/v1/readyz`, with the keyword `ok`;
  - `https://<host>/`.

  Alert the ops email. Add production's at the cutover (section 19.5, step 9).
- **Backup heartbeat**: in Healthchecks.io (free), create a check with a 1-day period and a 2-hour grace. Put its ping URL in `BACKUP_HEARTBEAT_URL`. `backup.sh` pings it only after a successful upload, so a missed or failed backup alerts by email.

## 13. Routine deploy and rollback

**Deploy**: section 10's first three commands, with the ref to ship. A failed `readyz` switches back to the previous release by itself, and the script exits non-zero.

**Roll back by hand**: deploy an earlier release. It is already built, so it switches in seconds:

```sh
ls -t /srv/housing/staging/releases   # newest first; the last 5 are kept
deploy/deploy.sh staging <older sha>
```

Migrations are not undone. They are add-only, so the older code runs on the newer schema.

**Production deploys** take a backup before migrating. If a migration ever has to be undone, restore that backup (section 14 shows the restore). Plan a destructive migration on its own, with its undo written down (`DB-MIG-05`).

**If the CSP blocks something on staging**:
1. On the box, change `Content-Security-Policy` to `Content-Security-Policy-Report-Only` in `/etc/nginx/housing/staging/ui-headers.conf`.
2. Run `nginx -t` and reload.
3. Fix it in `deploy/nginx/ui-headers.conf` through a pull request.

Don't remove the header.

## 14. Restore drill

Before the C7 cutover, then every quarter. Run it on the box as the staging user. It restores into a scratch database on the staging cluster and never touches a live database.
1. In IAM, create an access key for `housing-drill-reader`, or use STS for a short session.
2. Put the age private key in memory only:

   ```sh
   cat > /dev/shm/housing-age.key   # paste the key, then Ctrl-D; the script deletes it when it ends
   chmod 600 /dev/shm/housing-age.key
   ```

3. Run the drill. The variables stay in this shell only; never use `aws configure`, which writes `~/.aws`.

   ```sh
   cd /srv/housing/staging/current
   export BACKUP_BUCKET=<org>-housing-backups AWS_DEFAULT_REGION=<region>
   read -rs AWS_ACCESS_KEY_ID; read -rs AWS_SECRET_ACCESS_KEY; export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
   read -rs DRILL_PW; export DRILL_DATABASE_URL="postgres://housing_drill:$DRILL_PW@127.0.0.1:5433/postgres?sslmode=disable"
   export AGE_IDENTITY=/dev/shm/housing-age.key
   # optional, to compare with the live database the backup came from:
   export SOURCE_DATABASE_URL=$(grep '^DATABASE_MIGRATION_URL=' /etc/housing/staging/deploy.env | cut -d= -f2-)
   deploy/restore-drill.sh staging   # or: production, and a key like production/housing-20261006T021500Z.dump.age
   ```

   - A production drill needs `SOURCE_DATABASE_URL` from production's `deploy.env`, read as root.
   - It briefly holds production data on the staging cluster. The script drops it at the end.
4. The drill passes when it ends with `restore-drill: passed`:
   - the counts are close to the live ones (newer writes explain any difference);
   - `serials above counter` is `0`.
5. Delete the IAM access key, then `exit` the shell.
6. Add a row to the drill log below.

| Date | Environment | Backup | Result | By |
|---|---|---|---|---|
| | | | | |

## 15. Quarterly orphan check

A crash between a photo's upload and its database commit can leave an object that no `housing_files` row points to. Nothing links to it, and there is no automatic sweep. Count such objects quarterly:

```sh
sudo -iu housing-staging   # or housing-prod
set -a; . /etc/housing/staging/api.env; set +a
aws s3 ls "s3://$S3_BUCKET/housing/" | awk '{print "housing/"$4}' | sort > /tmp/s3-keys
psql "$DATABASE_URL" -tAc "select storage_key from housing_files" | sort > /tmp/db-keys
comm -23 /tmp/s3-keys /tmp/db-keys   # objects with no row
rm /tmp/s3-keys /tmp/db-keys
```

A few are harmless. Delete them with `aws s3 rm` after checking their dates. If the list keeps growing, plan an orphan sweep; the storage adapter would then need a `list` operation.

## 16. Production in C6: prepare only

Do these for production now:
- Sections 2–6.
- Section 9.
- Section 10, without admins: `deploy/deploy.sh production main`, then start the two nightly jobs. The deploy takes a backup first, then migrates the empty production database.

Then check on the box:

```sh
curl -s http://127.0.0.1:3201/api/v1/readyz   # {"data":{"status":"ok"}}
```

Leave these alone until the cutover (section 19):
- production's nginx vhost and DNS;
- its Cloudflare settings;
- its UI. `build.env` holds the Supabase values, and the built UI isn't served.

## 17. Secret rotation

Rotate when someone with access leaves, after a suspected leak, and once a year.

| Secret | How |
|---|---|
| `housing_owner` and `housing_app` passwords | `sudo -u postgres psql -p <port> -c '\password housing_app'`, then update the URL in the env file. For `housing_app`, run `pm2 reload housing-api-<env>`. |
| App and backup AWS keys | Create a second key for the IAM user, update the env file, reload the API (app key only), then delete the old key. |
| age key pair | Generate a new pair (section 6) and update `AGE_RECIPIENT`. Keep the old private key until the last backup made with it has expired, 31 days later. |
| Cloudflare origin certificate | Create a new one, install it (section 7), reload nginx, then revoke the old one. |

## 18. Ops checklist

Tick each item per environment.
- Production in C6 covers only the items section 16 lists.
- Every "for C6" note from chunks C1–C5 is here. The C7 items are in section 20.

- [ ] PostgreSQL 17 cluster on localhost only; `roles.sql` run once; `housing` database created (C1)
- [ ] Env files are mode 600, owned by the environment user; secrets are in no other place
- [ ] `COOKIE_SECURE=true` and `TRUST_PROXY=1` in `api.env` (C2, C3, C5)
- [ ] One API process (`instances: 1`; the rate limits are in memory) (C2)
- [ ] `ss -ltnp | grep 3101` shows `127.0.0.1` only: the API is reachable only through nginx (C2)
- [ ] `PUBLIC_API_URL` is the final `https://<host>` before the first photo upload (C5)
- [ ] The photo bucket has public access blocked, AES256 encryption, versioning and the TLS-only policy; the app's IAM policy covers that one bucket (C5, `NS-40`, `NS-43`)
- [ ] The S3 storage tests ran once against a test bucket and passed (C5, section 11)
- [ ] `housing-sweep-<env>` and `housing-backup-<env>` are in `pm2 ls`, and `pm2 save` was run (C5)
- [ ] `deploy.sh` passed its `require('sharp')` step (C5)
- [ ] The CSP allows the site's photos: same-origin `PUBLIC_API_URL`, and `edge-rest` is green in CI (C5)
- [ ] The first backup is in `s3://<org>-housing-backups/<env>/`; Object Lock is on; the heartbeat is green
- [ ] The restore drill passed and is logged (section 14)
- [ ] nginx: `nginx -t` passes, the vhost is reloaded, and HTTPS through Cloudflare works (staging)
- [ ] Authenticated Origin Pulls: a direct request to the box IP gets 400 (staging)
- [ ] The Cloudflare login rate rule blocked a test burst (staging)
- [ ] The uptime monitors are green and alert the ops email (staging)
- [ ] `pm2-logrotate` is installed with 50M × 14, compressed
- [ ] The staging admins were created with the CLI

## 19. Cutover (C7)

Production moves from Supabase to the new API in one planned window. Plan: [../plans/2026-10-06-1035-migrate-c7-cutover-plan.md](../plans/2026-10-06-1035-migrate-c7-cutover-plan.md). Section 20 is the checklist.

**Who**

| Role | Does |
|---|---|
| Operator | Everything on the box: deploys, the import and verify, nginx, backups and drills, admin CLI |
| Supabase owner | The Supabase dashboard and SQL editor: the export role, the CA file, the freeze, the admin review, the final dump, dropping the role |
| AWS admin | Staging bucket versions after the rehearsal; drill credentials |
| Cloudflare admin | Certificates, rules and cache purges for both hosts |
| Verifier | The read-only checks from a developer machine |
| Admins | Re-upload reported photo gaps before the cutover; log in once on the day |

**How the import runs.** On the box, as the environment's user, with both env files: `deploy.env` first (the owner URL), then `api.env` (the photo bucket and the app's AWS key). A later env file wins, but nothing overrides a variable already in the shell, so the command clears any AWS identity first:

```sh
cd /srv/housing/<env>/current
import_supabase() {
  env -u AWS_ACCESS_KEY_ID -u AWS_SECRET_ACCESS_KEY -u AWS_SESSION_TOKEN -u AWS_PROFILE \
    node --env-file=/etc/housing/<env>/deploy.env --env-file=/etc/housing/<env>/api.env \
    server/dist/cli/import-supabase.js "$@"
}
```

- It prints the target database and the photo bucket with the access key id it will use; stop if either is wrong.
- It asks for the Supabase database URL at a hidden prompt. Paste it there, never on a command line.
- `--report <file>` must be a new file. It holds record and admin ids only, mode 600. Delete it with the checklist.
- The command exits non-zero when anything is refused or any verify check fails.

| Flag | Use |
|---|---|
| `--photo-base https://<ref>.supabase.co/storage/v1/object/public/housing-photos/` | Required for `import`; only photo URLs inside it are fetched |
| `--source-ca <file>` | Supabase's CA certificate (Dashboard → Project Settings → Database → SSL configuration → Download certificate) |
| `--replace --confirm-db housing` | Wipe a non-empty target first (staging rehearsals, a second cutover) |
| `--discard-new-writes` | Also wipe a target whose activity log is newer than Supabase's |
| `--without-passwords` | Staging only: no real hash is copied; every admin arrives disabled |
| `verify --report <file> --photos --photos-via <origin>` | Re-check everything and GET every photo through `<origin>` |

### 19.1 The Supabase export role (T−8 days, Supabase owner)

A temporary role that can only read what the import needs, used for the rehearsal and the cutover. In the SQL editor (generate the password with `openssl rand -hex 24`):

```sql
create role housing_export login password '<password>' valid until '<cutover date + 2 days>' bypassrls;
grant usage on schema public, auth to housing_export;
grant select on public.housing_beneficiaries, public.housing_serial_counters, public.housing_serial_changes,
  public.housing_activity_log, public.housing_admins to housing_export;
grant select on all sequences in schema public to housing_export;   -- for the final pg_dump
grant select (id, email, encrypted_password, raw_user_meta_data, created_at, deleted_at, banned_until)
  on auth.users to housing_export;
```

- Connection string: Dashboard → Connect → **Session pooler** (the box may have no IPv6), with the user `housing_export.<ref>` and this password.
- **If Supabase refuses** `bypassrls` or the grant on `auth.users`, use the `postgres` connection string instead, and reset the database password (Dashboard → Database settings) after the rehearsal and again after the cutover.
- Give the string to the operator in person or through a password manager, never in chat or email.

**Pre-check** (C1 note): the live activity-log trigger should be the fixed version. In the SQL editor:

```sql
select pg_get_functiondef('public.housing_log_record_change'::regproc) like '%array_append%' as fixed;
```

`false` means photo changes on Supabase have been failing, and the log has no rows for them. The import copies the log as it is; tell the admins, and don't re-run `09_activity_log.sql` on live just for this.

### 19.2 Rehearsal on staging (T−7 days)

Production's personal data sits on staging for this day only, without password hashes.

1. **Lock staging** (Cloudflare admin): a WAF custom rule for the staging host, `(http.host eq "<staging host>" and not ip.src in {<operator IPs>})` → Block. Check from another network that staging answers 403.
2. **No copies** (operator): `pm2 stop housing-backup-staging housing-sweep-staging`, and `sudo -u postgres psql -p 5433 -c 'show archive_mode'` says `off`. Take no `pg_dump` today.
3. **Time a restore drill** on a staging backup taken before the import (section 14), for the freeze estimate.
4. **Import** (start a timer):

   ```sh
   import_supabase import --report ~/rehearsal-report.json --without-passwords \
     --replace --confirm-db housing --discard-new-writes \
     --photo-base https://<ref>.supabase.co/storage/v1/object/public/housing-photos/ --source-ca ~/supabase-ca.crt
   ```

   `--replace` wipes staging's own records, photos and admins (staging's log is newer than Supabase's, hence `--discard-new-writes`). Supabase isn't frozen today, so drift in the end-of-import verify is expected only if an admin wrote during the run.
5. **Verify with photos** (timer): `import_supabase verify --report ~/rehearsal-report.json --source-ca ~/supabase-ca.crt --photos --photos-via http://127.0.0.1:3101`.
6. **Read the report** with the Supabase owner:
   - `photo_gaps`: each is a photo already broken on Supabase. Admins re-upload those in the Supabase UI before the cutover.
   - `admins_disabled`: with `--without-passwords` it lists everyone; the reasons other than `without_passwords` matter.
7. **Speed**: `psql "$(grep ^DATABASE_URL= /etc/housing/staging/api.env | cut -d= -f2-)" -v q='<a common name fragment>' -f deploy/sql/perf-check.sql`. Any `Execution Time` over 50 ms is a finding to fix before the cutover.
8. **Read-only checks** from an operator IP (verifier):

   ```sh
   REST_READONLY_URL=https://<staging host> npm run test:contract:rest-readonly
   E2E_EDGE_URL=https://<staging host> npx playwright test --project=edge-rest
   ```

9. **Wipe, the same day** (operator, as `housing_owner` on 5433):

   ```sql
   truncate public.housing_activity_log, public.housing_serial_changes, public.housing_files,
     public.housing_beneficiaries, public.housing_admin_sessions, public.housing_admins restart identity;
   update public.housing_serial_counters set last_serial = 0;
   vacuum full public.housing_activity_log, public.housing_serial_changes, public.housing_files,
     public.housing_beneficiaries, public.housing_admins;
   ```

   Then `rm ~/rehearsal-report.json`.
10. **Wipe the photos and their versions** (AWS admin; the app's key can't delete versions; needs `jq`). Repeat until `jq` exits non-zero:

    ```sh
    B=<org>-housing-photos-staging
    aws s3api list-object-versions --bucket "$B" --prefix housing/ --max-items 1000 \
      --query '{Objects: [Versions[].{Key:Key,VersionId:VersionId}, DeleteMarkers[].{Key:Key,VersionId:VersionId}][]}' --output json > /tmp/v.json
    jq -e '.Objects | length > 0' /tmp/v.json && aws s3api delete-objects --bucket "$B" --delete file:///tmp/v.json
    rm /tmp/v.json
    ```

11. **Restore staging**: recreate its admins (section 10), `pm2 start housing-backup-staging housing-sweep-staging`, remove the WAF rule.
12. **Sign-off**: a named person runs `select count(*)` on each table in step 9 (all `0`) and `aws s3api list-object-versions --bucket <org>-housing-photos-staging --prefix housing/ --max-items 1` (no versions), then ticks the rehearsal line in section 20.
13. Fill the **Rehearsal** column below. Freeze length ≈ import + verify + backup + drill + 15 minutes for the switch and smoke tests.

| Step | Local baseline (20 records) | Rehearsal |
|---|---|---|
| Import (records, admins, photos) | 0.5 s | |
| Verify with photos | 0.3 s | |
| `backup.sh production` | | |
| Restore drill | | |

### 19.3 T−2 days

- Announce the freeze window to the admins: from that time no edits, uploads or imports on the old site; log in on the new one once it's announced. Public visitors see no change.
- Agree with the other developer that nothing using the Supabase service-role key (it bypasses RLS and the freeze) runs from the freeze on.

### 19.4 T−1 day (no public change)

1. **Cloudflare** (section 8) for `<prod host>`: an origin certificate, Authenticated Origin Pulls on, the login WAF rule. The DNS record already points at the box (it serves the Supabase UI today).
2. **Box** (operator):
   - `dnf install -y postgresql17-contrib` (migration 0010 needs `pg_trgm`).
   - In `/etc/housing/production/build.env`, replace the Supabase values with:

     ```sh
     VITE_HOUSING_BACKEND=rest
     VITE_API_BASE_URL=https://<prod host>
     ```

   - Check `PUBLIC_API_URL=https://<prod host>` in `api.env`: the imported photo URLs are built from it.
   - `deploy/deploy.sh production <sha>`: builds the `rest` UI into `current/dist`, backs up, migrates to 0010. The public vhost still serves the Supabase UI.
   - Render production's nginx files without enabling them:

     ```sh
     HOUSING_SERVER_NAME=<prod host> deploy/render-nginx.sh production /tmp/housing-nginx-production
     sudo install -d -m 755 /etc/nginx/housing/production
     sudo cp /tmp/housing-nginx-production/* /etc/nginx/housing/production/
     sudo install -m 644 origin.pem /etc/nginx/housing/production/origin.pem
     sudo install -m 600 origin.key /etc/nginx/housing/production/origin.key
     ```

   - Find the Supabase UI's server block (`sudo grep -rl 'server_name <prod host>' /etc/nginx/`) and note the file and its `root` directory. Copy the file to `/etc/nginx/housing/supabase-ui.conf.bak`. Leave both in place.
3. **Supabase owner**: the export role exists (19.1); the CA file is on the box at `~housing-prod/supabase-ca.crt`.

### 19.5 Cutover day

Note the start time; it is the "cutover time" for rollback.

1. **Freeze** (Supabase owner). Save the live definition first, to undo the freeze with:

   ```sql
   select pg_get_functiondef('public.is_housing_admin'::regproc);   -- copy the result into a file
   ```

   Then:

   ```sql
   create or replace function public.is_housing_admin()
   returns boolean language sql stable security definer set search_path = public
   as $$ select false $$;
   ```

   Check it as an admin would see it (before the freeze this returns `true`):

   ```sql
   begin;
   set local role authenticated;
   set local request.jwt.claims = '{"sub":"<an admin user_id>","role":"authenticated"}';
   select public.is_housing_admin();   -- false
   rollback;
   ```

   The old admin UI still *shows* admin pages (`housing_current_admin()` reads the list directly); every write from it fails. Record `select count(*) from public.housing_activity_log` and `select max(updated_at) from public.housing_beneficiaries`.
2. **Import** (operator):

   ```sh
   import_supabase import --report ~/cutover-report.json \
     --photo-base https://<ref>.supabase.co/storage/v1/object/public/housing-photos/ --source-ca ~/supabase-ca.crt
   ```

3. **Verify** (operator): `import_supabase verify --report ~/cutover-report.json --source-ca ~/supabase-ca.crt --photos --photos-via http://127.0.0.1:3201`. The Supabase owner re-runs the two step 1 queries: unchanged.
4. **Admins** (Supabase owner, operator): go through `admins_disabled` and `node --env-file=/etc/housing/production/deploy.env server/dist/cli/admin.js list`. Disable anyone who shouldn't be an admin any more (`admin.js disable --email …`).
5. **Backup and drill** (operator): `deploy/backup.sh production`, then the restore drill on that backup (section 14, as the staging user, with `SOURCE_DATABASE_URL` from production's `deploy.env`).
6. **Switch** (operator, Cloudflare admin):

   ```sh
   sudo mv <the Supabase UI server block file> /etc/nginx/housing/supabase-ui.conf.disabled
   echo 'include /etc/nginx/housing/production/housing.conf;' | sudo tee /etc/nginx/conf.d/housing-production.conf
   sudo nginx -t && sudo systemctl reload nginx
   ```

   If `nginx -t` fails: put the old file back, remove `housing-production.conf`, run `nginx -t` again, and fix before retrying. Then the Cloudflare admin purges the cache for `<prod host>`.
7. **Smoke tests**:
   - Operator: `import_supabase verify --report ~/cutover-report.json --source-ca ~/supabase-ca.crt --photos --photos-via https://<prod host>`.
   - Verifier:

     ```sh
     REST_READONLY_URL=https://<prod host> npm run test:contract:rest-readonly
     E2E_EDGE_URL=https://<prod host> npx playwright test --project=edge-rest
     ```

   - The Authenticated Origin Pulls and WAF checks from section 8, for `<prod host>`.
8. **Admins log in** once each and open the activity log. This replaces each imported bcrypt hash with argon2id. No test edit in production: a test record would use up a real serial number.
9. **Monitor**: production's `https://<prod host>/api/v1/readyz` and `/` in the uptime monitor (section 12). Announce that edits are open.
10. **End of the day**: `admin.js list`. Disable anyone whose hash is still `bcrypt`; they get `set-password` and `enable` when they ask (the C2 timing gap stays closed).

Freeze length = steps 1–8.

### 19.6 After the cutover

- **Final Supabase dump** (the same day; Supabase is frozen, so it holds what was imported). On the box as the production user, in memory only:

  ```sh
  umask 077; d=$(mktemp -d /dev/shm/supabase-final.XXXXXX)
  read -rs PGPASSWORD; export PGPASSWORD   # the export role's password
  PGSSLMODE=verify-full PGSSLROOTCERT=~/supabase-ca.crt \
    pg_dump -Fc -h <pooler host> -p 5432 -U housing_export.<ref> -d postgres -t 'public.housing_*' -f "$d/dump"
  set -a; . /etc/housing/production/deploy.env; set +a
  age -r "$AGE_RECIPIENT" -o "$d/dump.age" "$d/dump"
  aws s3 cp "$d/dump.age" "s3://$BACKUP_BUCKET/production/supabase-final-$(date -u +%Y%m%dT%H%M%SZ).pgdump.age"
  rm -rf "$d"; unset PGPASSWORD
  ```

  - The `.pgdump.age` suffix keeps the restore drill from taking it for the newest backup.
  - It holds no `auth.users` rows; the hashes are in the new database.
  - Object Lock keeps it 30 days, then it expires.
- **Supabase owner**: `drop role housing_export;` (or reset the `postgres` password, for the fallback). Delete `~/supabase-ca.crt` and `~/cutover-report.json` on the box.
- **First week**: `pm2 logs housing-api-production`, the uptime monitor and the activity log, daily.
- **Supabase stays frozen** for 14 days, then C8 removes it.

### 19.7 Rollback

**Before step 6** nothing public changed. Unfreeze Supabase (run the definition saved in step 1), fix the problem, and repeat from step 1 another day with `import --replace --confirm-db housing`.

**After step 6, within 72 hours of the cutover time:**
1. Stop writes on the new stack: `admin.js disable --email …` for every admin (it also ends their sessions).
2. List what changed since the cutover, as `housing_owner` on 5432:

   ```sql
   select id, at, actor_email, action, project_type, serial_no, record_id, details
   from public.housing_activity_log
   where at > '<cutover time>' and action not in ('login', 'logout')
   order by id;
   ```

3. Switch nginx back: remove `/etc/nginx/conf.d/housing-production.conf`, move the Supabase UI file back from `supabase-ui.conf.disabled`, `nginx -t`, reload. Purge the Cloudflare cache.
4. Unfreeze Supabase with the saved definition.
5. Admins re-enter the listed changes in the old UI, **in the same order**: Supabase's counters stand where the import found them, so creates entered in order get the same serials. Photos are uploaded again. Password changes made on the new stack don't carry back.
6. A later cutover starts again at 19.4, with `import --replace --confirm-db housing --discard-new-writes`.

**After 72 hours**: fix forward on the new stack. Supabase stays frozen until C8 as a read-only reference.

## 20. Cutover checklist (C7)

- [ ] 19.1 export role created (or the `postgres` fallback chosen); the live trigger pre-check result noted
- [ ] Staging rehearsal done, timings filled in, report reviewed with the Supabase owner (19.2)
- [ ] `perf-check.sql` on the rehearsal data: everything under 50 ms, or fixed (C3, C4 notes)
- [ ] Reported photo gaps re-uploaded on Supabase by the admins
- [ ] Rehearsal wipe signed off: housing tables at 0 rows, no photo versions left, report deleted, WAF lock removed, staging admins and PM2 jobs back. Signed: ____ on ____
- [ ] Freeze announced to the admins; the other developer runs nothing with the service-role key
- [ ] Production: `postgresql17-contrib`, `build.env` on `rest`, `PUBLIC_API_URL` = `https://<prod host>`, deployed at 0010 (C6 notes)
- [ ] Production nginx files rendered and installed; the Supabase UI server block noted and copied (C6 note)
- [ ] Cloudflare for `<prod host>`: origin certificate, Authenticated Origin Pulls, login WAF rule
- [ ] Freeze applied, its saved definition kept, the as-admin check returned `false`
- [ ] Import and verify passed; the step 1 counts unchanged after verify
- [ ] Every imported email passes the login rule and every active admin was confirmed (C2 note)
- [ ] Fresh production backup restored in a drill and logged (C6 note)
- [ ] nginx switched, `nginx -t` passed, cache purged
- [ ] Verify through `https://<prod host>`, the read-only contract and `edge-rest` passed; origin pulls and WAF checked
- [ ] Every admin logged in once; end-of-day `admin list` shows no active `bcrypt` hash (C2 note)
- [ ] Production `readyz` and `/` in the uptime monitor (C6 note)
- [ ] Final Supabase dump uploaded; export role dropped; CA file and reports deleted on the box
- [ ] Supabase still frozen at day 14; C8 can start
