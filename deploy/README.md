# deploy/

What the organization box runs for staging and production. The steps a person does (first setup, env files, AWS, Cloudflare, deploys, rollback, restore drills) are in [../docs/operations/runbook.md](../docs/operations/runbook.md).

| File | What it is |
|---|---|
| `ecosystem.config.cjs` | PM2 apps for one environment (`HOUSING_ENV=staging\|production`): the API, the nightly `files:sweep` and the nightly backup |
| `deploy.sh <env> <ref>` | Builds a git ref, migrates as `housing_owner`, switches `current`, reloads the API and checks `/api/v1/readyz`; switches back if it isn't ready |
| `backup.sh <env>` | `pg_dump`, encrypted with age, streamed to S3 |
| `restore-drill.sh <env> [key]` | Restores a backup into a scratch database and checks it with `sql/verify-restore.sql` |
| `lib.sh` | Helpers the scripts share |
| `nginx/` | The nginx 1.20 vhost templates and `render-nginx.sh` |

Plan: [../docs/plans/2026-10-06-0925-migrate-c6-deploy-plan.md](../docs/plans/2026-10-06-0925-migrate-c6-deploy-plan.md).
