# Backend architecture: current and target

The UI only talks to three interfaces (`HousingApi`, `AuthProvider`, `ImageStorage`). A factory picks the adapter from `VITE_HOUSING_BACKEND`.

## Current: Supabase

```mermaid
flowchart TB
  UI[React UI pages and hooks] --> F[Adapter factory]
  F -->|supabase| SA[Supabase adapter]
  F -->|rest, stub today| RA[REST adapter]
  SA --> PG[(Supabase Postgres<br/>tables, RLS, RPC functions)]
  SA --> AU[Supabase Auth]
  SA --> ST[Supabase Storage<br/>bucket housing-photos]
```

## Target: Express and PostgreSQL

```mermaid
flowchart TB
  UI[React UI pages and hooks] --> F[Adapter factory]
  F -->|rest| RA[REST adapter]
  RA -->|HTTP /api/...| EX[Express server]
  EX --> MW[Auth and admin middleware]
  EX --> SV[Services: serial, bulk, stats, activity]
  SV --> PG[(PostgreSQL)]
  EX --> PH[Photo routes<br/>POST/DELETE /housing/:id/photo admin<br/>GET /photos/:id public]
  PH --> PG
  PH --> STG[storage adapter<br/>STORAGE_DRIVER]
  STG -->|nas| NAS[NAS folder at STORAGE_ROOT]
  STG -->|s3, temporary| S3[Private AWS S3 bucket<br/>no local S3; tests need a real test bucket]
```

Photos (C5, `docs/plans/2026-10-05-1722-migrate-c5-photos-plan.md`): each upload is re-encoded to WebP with EXIF removed and stored under a new UUID key, with a `housing_files` row tied to the record's slot. The record's `*_url` columns hold `PUBLIC_API_URL/api/v1/photos/<file id>`, so the browser only ever loads photos through the API. Files are written before the transaction and removed after commit; a serial change touches no file.

## Deployment (C6)

```mermaid
flowchart TB
  B[Browser] --> CF[Cloudflare<br/>TLS, WAF, login rate rule]
  CF -->|Authenticated Origin Pulls<br/>client cert required| NG[nginx 1.20 vhost per env<br/>real IP from CF-Connecting-IP<br/>overwrites X-Forwarded-For]
  NG -->|/ and /assets| UI[Static UI<br/>/srv/housing/env/current/dist<br/>CSP and security headers]
  NG -->|/api/ on 127.0.0.1| API[PM2: housing-api-env<br/>one process, TRUST_PROXY=1]
  API --> PG[(PostgreSQL 17 cluster per env<br/>localhost only, housing_app)]
  API --> S3P[(S3 photos bucket per env<br/>private, versioned)]
  SW[PM2 cron: files:sweep 03:30] --> PG
  SW --> S3P
  BK[PM2 cron: backup.sh 02:15<br/>pg_dump as housing_owner, age-encrypted] --> PG
  BK -->|PutObject only| S3B[(S3 backups bucket<br/>Object Lock 30 days)]
  OPS[Person on the box:<br/>deploy.sh env ref] -->|build, migrate as housing_owner,<br/>switch release, readyz, rollback| API
  MON[Uptime monitor] -->|/api/v1/readyz| CF
```

Staging and production each have their own Linux user, PM2 daemon, Postgres cluster, env files in `/etc/housing/<env>/` (`api.env`, `build.env`, `deploy.env`) and photo bucket. Before the cutover, production runs only the API on loopback and the backups while its public vhost serves the Supabase UI; the cutover (below) switches the vhost to this picture. Plan: `docs/plans/2026-10-06-0925-migrate-c6-deploy-plan.md`; steps for a person: `docs/operations/runbook.md`.

## Import and cutover (C7)

```mermaid
flowchart LR
  subgraph SB[Supabase, frozen: is_housing_admin returns false]
    SPG[(Postgres<br/>housing_* tables, auth.users)]
    SST[(Storage<br/>public housing-photos bucket)]
  end
  subgraph BOX[Organization box, as housing-prod]
    CLI[import-supabase import / verify<br/>owner role, prompted source URL]
    PG[(PostgreSQL 17<br/>production cluster)]
    API[housing-api-production<br/>127.0.0.1:3201]
  end
  S3P[(S3 photos bucket<br/>production)]
  CLI -->|read-only snapshot,<br/>verified TLS, export role| SPG
  CLI -->|GET inside --photo-base,<br/>no redirects| SST
  CLI -->|storage.put, new UUID keys| S3P
  CLI -->|one transaction:<br/>records, counters, log, admins, housing_files| PG
  CLI -->|verify --photos-via| API
  NG[nginx vhost for the prod host] -.->|switched after verify<br/>from the Supabase UI block| API
```

The import copies everything in one transaction after the photos are stored, and `verify` must pass before nginx is switched. Until the switch nothing public changes; for 72 hours after it, rollback puts the Supabase UI block back and unfreezes Supabase. Plan: `docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md`; steps: `docs/operations/runbook.md` section 19.

## Where each Supabase service goes

```mermaid
flowchart LR
  A[Supabase PostgREST queries] --> A2[Express routes plus SQL]
  B[Row Level Security] --> B2[requireAdmin middleware]
  C[RPC functions<br/>stats, bulk, serial, activity] --> C2[Postgres functions or service code]
  D[Supabase Auth] --> D2[Login endpoint, argon2, HttpOnly cookie session]
  E[Supabase Storage] --> E2[Photo routes plus storage adapter<br/>served through GET /photos/:id]
```
