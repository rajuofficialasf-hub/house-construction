# Backend architecture

The UI talks to the backend only through the interfaces in `src/backend/interfaces/` (`HousingApi`, `ProjectsApi`, `AuthProvider`, `AdminUsersApi`). `src/backend/factory.ts` picks the adapter from `VITE_HOUSING_BACKEND`: `rest` (the default) or `mock` (dev and tests only).

## Request path

```mermaid
flowchart TB
  UI[React UI pages and hooks] --> F[Adapter factory]
  F -->|rest, default| RA[REST adapter<br/>src/backend/rest]
  F -->|mock, dev and tests| MK[In-memory mock<br/>three fixed projects]
  RA -->|HTTP /api/v1, cookie session| EX[Express server<br/>server/src/app.ts]
  EX --> MW[CORS lists, Origin check,<br/>session, rate limits]
  MW --> RT[Routes: projects, fields, records,<br/>private values, stats, activity, auth]
  RT --> PG[(PostgreSQL 17<br/>housing_app role)]
  MW --> PH[Photo and cover routes<br/>PUT/DELETE admin, GET /photos/:id public]
  PH --> PG
  PH --> STG[Storage adapter<br/>STORAGE_DRIVER]
  STG -->|nas, dev and tests| NAS[NAS folder at STORAGE_ROOT]
  STG -->|s3, built, unused| S3[Private S3 bucket]
```

Who may do what is decided in the API: visitors see only published projects and public fields, admins also see drafts and private fields, and only the `main_admin` may delete. The data rules (field values, record checks, project and field guards, serial counters, the activity log) are triggers and functions in the database, owned by `housing_owner`.

Photos: each upload is re-encoded to WebP with its metadata removed and stored under a new UUID key, with a `housing_files` row tied to the record's slot or the project's cover. A record's photo columns and a project's `cover_path` hold `PUBLIC_API_URL/api/v1/photos/<file id>`, so the browser only ever loads photos through the API. Files are written before the transaction and removed after commit; a serial change touches no file.

## Registry tables

```mermaid
erDiagram
  housing_projects ||--o{ housing_projects : "parent_key (groups)"
  housing_projects ||--o{ housing_project_fields : "project_key"
  housing_projects ||--o{ housing_beneficiaries : "project_type"
  housing_beneficiaries ||--o| housing_beneficiary_private : "record_id, cascade"
  housing_beneficiaries ||--o{ housing_files : "record_id (photos)"
  housing_projects ||--o{ housing_files : "project_key (cover)"
  housing_admins ||--o{ housing_files : "created_by"
  housing_admins ||--o{ housing_admin_sessions : "admin_id, cascade"

  housing_projects {
    text key PK
    text parent_key FK
    boolean is_group
    boolean is_published
    text slug
    text photo_mode
    text cover_path
  }
  housing_project_fields {
    uuid id PK
    text project_key FK
    text key
    text type
    text visibility
    boolean is_active
  }
  housing_beneficiaries {
    uuid id PK
    text project_type FK
    integer serial_no
    text union_name
    jsonb extra
  }
  housing_beneficiary_private {
    uuid record_id PK
    jsonb data
  }
  housing_files {
    uuid id PK
    uuid record_id FK
    text project_key FK
    text kind
    timestamptz deleted_at
  }
  housing_admins {
    uuid id PK
    text email
    text role
  }
  housing_admin_sessions {
    bytea token_hash PK
    uuid admin_id FK
  }
```

`housing_serial_counters`, `housing_serial_changes` and `housing_activity_log` sit beside these with no foreign key, so a deleted record's serial history and log rows stay. The migrations that build each table are listed in `docs/architecture/migration-notes.md`.
