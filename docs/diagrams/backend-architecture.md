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
  STG -->|s3, temporary| S3[Private S3 bucket<br/>MinIO locally]
```

Photos (C5, `docs/plans/2026-10-05-1722-migrate-c5-photos-plan.md`): each upload is re-encoded to WebP with EXIF removed and stored under a new UUID key, with a `housing_files` row tied to the record's slot. The record's `*_url` columns hold `PUBLIC_API_URL/api/v1/photos/<file id>`, so the browser only ever loads photos through the API. Files are written before the transaction and removed after commit; a serial change touches no file.

## Where each Supabase service goes

```mermaid
flowchart LR
  A[Supabase PostgREST queries] --> A2[Express routes plus SQL]
  B[Row Level Security] --> B2[requireAdmin middleware]
  C[RPC functions<br/>stats, bulk, serial, activity] --> C2[Postgres functions or service code]
  D[Supabase Auth] --> D2[Login endpoint, argon2, HttpOnly cookie session]
  E[Supabase Storage] --> E2[Photo routes plus storage adapter<br/>served through GET /photos/:id]
```
