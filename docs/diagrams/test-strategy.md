# Test strategy for the migration safety net

One contract, checked at three layers. The same specs are re-pointed at the new backend after migration.

```mermaid
flowchart TB
  subgraph L1[Layer 1: Unit tests - Vitest]
    U1[Import parse and validate]
    U2[Filters, geo, photo paths, CSV]
    U3[Bangla numbers and NFC text]
  end
  subgraph L2[Layer 2: Backend contract tests - Vitest]
    C1[Same suite, any adapter]
  end
  subgraph L3[Layer 3: Browser flow specs - Playwright]
    P1[Public read flows]
    P2[Admin and write flows]
  end
  C1 -->|full suite| MOCK[In-memory mock backend]
  C1 -->|read-only part| LIVE[Live Supabase project]
  C1 -.->|after migration, full suite| EXP[Express and Postgres]
  P1 --> LIVE
  P1 --> MOCK
  P2 --> MOCK
  P2 -.->|after migration| EXP
```

## Which backend each test runs against

```mermaid
flowchart LR
  subgraph Today
    R[Read-only tests] --> LV[Live Supabase<br/>never written]
    W[Write and admin tests] --> MK[Mock backend]
  end
  subgraph AfterMigration[After migration]
    R2[Read tests] --> NB[Express and Postgres test DB]
    W2[Write and admin tests] --> NB
  end
```

## Why live stays read-only

```mermaid
flowchart LR
  T[Test creates a record on live] --> S[Serial counter goes up]
  S --> X[Delete does not lower it]
  X --> G[Permanent gap in real serial numbers]
  T --> AL[Activity log gets permanent rows]
```
