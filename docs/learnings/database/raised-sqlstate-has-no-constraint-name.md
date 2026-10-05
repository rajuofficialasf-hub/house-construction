---
title: An error a function raises itself with a SQLSTATE carries no constraint name, so map it by code too
date: 2026-10-05
type: database
module: server/errors (Postgres error mapping)
severity: medium
tags: [postgres, sqlstate, unique-violation, 23505, error-mapping, plpgsql, postgres-js]
applies_when: mapping Postgres errors to HTTP statuses when some of them come from plpgsql `raise ... using errcode`, not from a real constraint
---

# An error a function raises itself with a SQLSTATE carries no constraint name

## What happened
The C4 plan mapped `23505` to 409 only when `constraint_name` was the serial unique key, and every other `23505` to 500. But `housing_change_serial` checks for a taken serial first and raises the error itself:

```sql
-- server/db/migrations/0002_serial.sql
raise exception 'সিরিয়াল % আগে থেকেই আছে', p_new_serial using errcode = '23505';
```

An error raised this way has the SQLSTATE but no `constraint_name`, because no constraint fired. So the most common change-serial conflict would have answered 500, failing the contract test and the serial-change e2e spec. Only a real race reaches the unique index and carries the name. The plan's feasibility review caught it before any code was written.

## What to do
Map by SQLSTATE, and treat a missing constraint name as "raised on purpose by our own function". Keep the constraint check only to keep unrelated constraints a 500:

```ts
// server/src/errors.ts
case '23505':
  // housing_change_serial raises its own 23505 with no constraint (0002_serial.sql).
  if (!err.constraint_name || err.constraint_name === SERIAL_KEY) return new AppError('CONFLICT', 'এই সিরিয়াল আগে থেকেই আছে');
  return undefined; // a 23505 on any other constraint is our bug: generic 500
```

Use fixed messages either way. Postgres's own text names tables and key values (NE-SEC-11).

## Why
In postgres.js, `PostgresError` fields come from the server's error report. A constraint violation fills in `constraint_name`, `table_name` and `detail`. A `raise ... using errcode` fills in only what the `raise` sets: code and message, plus `constraint` if the function passes `using constraint = '...'`. The Supabase adapter didn't hit this because it mapped by code alone (`src/features/housing/backend/supabase/errors.ts`).

## How to prevent it
- Before keying a mapping on `constraint_name`, grep the migrations for `errcode =` with the same code: `grep -rn "errcode = '23505'" server/db/migrations`.
- Test both sources: a unit test with a `PostgresError` that has no `constraint_name` (`server/src/errors.test.ts`), and an HTTP test that goes through the real function (`server/test/http/housing-writes.test.ts`, "refuses a taken serial with 409 from the database function").
- Or have the function pass `using constraint = '<name>'` so both sources look the same. Changing a ported function means a new migration, so here we mapped by code instead.

## Files
- `server/src/errors.ts`
- `server/src/errors.test.ts`
- `server/db/migrations/0002_serial.sql`
- `server/test/http/housing-writes.test.ts`
