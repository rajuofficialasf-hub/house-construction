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
  EX --> FS[Photo storage<br/>disk, S3 or MinIO]
```

## Where each Supabase service goes

```mermaid
flowchart LR
  A[Supabase PostgREST queries] --> A2[Express routes plus SQL]
  B[Row Level Security] --> B2[requireAdmin middleware]
  C[RPC functions<br/>stats, bulk, serial, activity] --> C2[Postgres functions or service code]
  D[Supabase Auth] --> D2[Login endpoint, bcrypt, JWT or cookie]
  E[Supabase Storage] --> E2[Photo upload endpoint plus static serving]
```
