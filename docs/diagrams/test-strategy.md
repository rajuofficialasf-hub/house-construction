# Test strategy

One contract, checked at three layers, against two backends: the Express server on a real PostgreSQL test database, and the in-memory mock. The commands are in `docs/testing/README.md`.

```mermaid
flowchart TB
  subgraph L1[Layer 1: Unit and server tests - Vitest]
    U1[UI units: import parsing, filters, geo, CSV, Bangla numbers]
    U2[Server: routes through Supertest, SQL rules, guards, migrations up and down]
  end
  subgraph L2[Layer 2: Backend contract - Vitest]
    C1[One suite, run through each adapter]
  end
  subgraph L3[Layer 3: Browser specs - Playwright]
    P1[Public flows, e2e/public]
    P2[Admin and write flows, e2e/mock]
    P3[Project registry flows, e2e/admin]
  end
  U2 --> TDB[(housing_test database)]
  C1 -->|HousingApi and ProjectsApi| REST[REST adapter and Express server]
  C1 -->|HousingApi only| MOCK[In-memory mock]
  REST --> TDB
  P1 -->|public-rest| DEV[Express server on the seeded dev database]
  P1 -->|public-mock| MOCK
  P2 -->|mock| MOCK
  P2 -->|admin-rest| REST
  P3 -->|admin-rest| REST
```

## Why the mock stays small

The mock keeps three fixed projects and no project or field edits. The registry's rules (guards, stats, private fields) live in the database, and a copy in TypeScript would drift from them, so the specs that need the registry run only on `admin-rest`.

## Why the database suites run one at a time

```mermaid
flowchart LR
  S[Server tests] --> T[(housing_test)]
  C[REST contract] --> T
  A[admin-rest specs] --> T
  T --> R[Each run resets the same database,<br/>so two at once break each other]
```
