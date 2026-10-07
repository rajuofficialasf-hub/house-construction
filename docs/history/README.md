# History

These files record how the project got here. They describe the Supabase version and the migration off it, not the app as it is now. For the app as it is now, read `docs/api/PROJECTS_API_CONTRACT.md`, `docs/architecture/migration-notes.md` and `docs/testing/README.md`.

| File | What it records |
|---|---|
| [HOUSING_PROGRESS.md](HOUSING_PROGRESS.md) | Progress notes of the Supabase build, step by step |
| [MULTI_PROJECT_PLAN.md](MULTI_PROJECT_PLAN.md) | The multi-project plan (the M-steps) as built on Supabase |
| [P8_WALKTHROUGH_CHECKLIST.md](P8_WALKTHROUGH_CHECKLIST.md) | The Chrome walkthrough that proved the new stack matched the Supabase version |

The plans in `docs/plans/` hold the reasoning behind each step of the move. `docs/plans/2026-10-06-1224-refactor-complete-move-to-own-stack-plan.md` is the move itself.

## Removal ledger

The Supabase version, its deploy tooling and the old single-project API were removed in P9 of that plan. To look at or restore any of them, use one of two sources:

- **`pre-p9`**, a tag on `dev-forhad` just before the removal. It holds the new stack and everything listed below, side by side.
- **`main` at `87c7241`**, the Supabase version as the other developer left it. It is the reference for every rule that was ported.

For example, `git show pre-p9:supabase/sql/10_projects.sql` or `git checkout pre-p9 -- deploy/`.

| What was removed | Where it lived | Restore from |
|---|---|---|
| The Supabase SQL (schema, RLS, functions, SQL 01–15), its local config and seed | `supabase/` | `pre-p9` or `main@87c7241` |
| The Supabase adapter | `src/backend/supabase/` | `pre-p9` or `main@87c7241` |
| The `@supabase/supabase-js` package and the `VITE_SUPABASE_*` settings | `package.json`, `.env.example` | `pre-p9` |
| The Supabase-only check scripts: `smoke`, `photo-check`, `content-check`, `admin-ui-check`, `adapter-check`, `build-rehearsal`, `security-check`, `migrate-photos`, `baseline-check` and `stats-filter-check` | `scripts/` | `pre-p9` or `main@87c7241` |
| The local-Supabase contract runners and their known-gap lists, and the live Playwright project | `tests/contract/supabase.*`, `scripts/contract-supabase-local.mjs`, `scripts/e2e-live.mjs`, `playwright.config.ts` | `pre-p9` |
| The deploy tooling: nginx vhosts, PM2, backups, restore drill, the edge compose service and its CI jobs | `deploy/`, `compose.yaml`, `.github/workflows/ci.yml` | `pre-p9` |
| The operations runbook (box setup, backups, cutover) | `docs/operations/runbook.md` | `pre-p9` |
| The old single-project API `/api/v1/housing` and its contract | `server/src/routes/v1/housing*.ts`, `docs/api/API_CONTRACT.md` | `pre-p9` |
| The SQL functions `housing_stats` and `housing_years` | dropped by `server/db/migrations/0018_drop_housing_stats_years.sql` (its down section recreates them) | `0018`'s down section |
| Verifying bcrypt password hashes imported from Supabase | `server/src/auth/password.ts` | `pre-p9` |
| The Supabase implementation of `/admin/users` (the page itself stays; P9b serves it from the server) | `src/backend/supabase/adminUsersApi.ts` | `pre-p9` or `main@87c7241` |

What a future host must still provide, which the deploy tooling used to set up, is under "Hosting requirements" in `docs/architecture/migration-notes.md`.
