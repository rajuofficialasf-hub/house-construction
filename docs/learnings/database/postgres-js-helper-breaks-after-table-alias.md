---
title: A table alias before ${sql(object)} makes postgres.js build the wrong SQL
date: 2026-10-06
type: database
module: server (postgres.js queries)
severity: medium
tags: [postgres-js, sql-helper, insert, update, alias, syntax-error]
applies_when: writing an insert or update with the ${sql(object)} helper, especially one that reuses an aliased column list
---

# A table alias before ${sql(object)} makes postgres.js build the wrong SQL

## What happened
The new record writes used `insert into public.housing_beneficiaries as b ${tx(row)}` and
`update public.housing_beneficiaries as b set ${tx(changes)}`, so they could reuse a `b.`-prefixed
column list in `returning`. Every write failed with `42601 syntax error at or near "$1"`, which surfaced
as a 500 with no hint in the route code.

## What didn't work
Reading the query text: the template looks like valid SQL. The cause is in how the helper picks
its output form, not in the SQL around it.

## What to do
Don't put a table alias between `insert into`/`update` and the helper. Return an unaliased column
list instead (`server/src/records/writes.ts`, `ADMIN_RECORD_COLUMNS` in `server/src/records/reads.ts`):

```ts
// Wrong: `as` is the last keyword before the helper, so it renders as a select list.
await tx`update public.housing_beneficiaries as b set ${tx(changes)} where b.id = ${id}`;

// Right
await tx`update public.housing_beneficiaries set ${tx(changes)} where id = ${id}
  returning ${tx(ADMIN_RECORD_COLUMNS)}`;
```

Keep aliases for reads, where the helper is only a column list (`select ${sql(columns)} from t b`).

## Why
`Builder.build` in `node_modules/postgres/src/types.js` searches the SQL text before the helper and
uses the **last** of these keywords: `values`, `in`, `select`, `as`, `returning`, `(`, `update`,
`insert`. In `update t as b set`, `as` comes after `update`, so the helper uses the select form (a list
of identifiers or values) instead of `col = $n, …`. In `insert into t as b`, it skips the
`(cols) values (…)` form the same way. `set` and `into` are not keywords, so they don't help.

## How to prevent it
- Every write goes through an HTTP test against the real database (`server/test/http/records-writes.test.ts`), which catches this on the first run.
- In review, look for `as <alias>` between `insert into`/`update` and `${sql(…)}`.

## Files
- `server/src/records/writes.ts`
- `server/src/records/reads.ts`
- `node_modules/postgres/src/types.js` (`Builder.build`, `builders`)
