---
title: Copy rows between databases as to_jsonb text, and bind that text as ::text::jsonb — postgres.js double-encodes a string bound to ::jsonb
date: 2026-10-06
type: database
module: server/import (Supabase import)
severity: medium
tags: [postgres, postgres-js, jsonb, jsonb-populate-recordset, to-jsonb, timestamptz, precision, data-migration]
applies_when: copying rows from one Postgres database to another through Node, or passing a JSON string to a jsonb parameter with postgres.js
---

# Copy rows as to_jsonb text, and bind the text as `::text::jsonb`

## What happened
The Supabase import had to copy records, serial changes and the activity log so exactly that a row-by-row md5 comparison passes. Reading rows into JS objects and inserting them back would lose data quietly:
- `timestamptz` becomes a JS `Date`, which has milliseconds; Postgres stores microseconds.
- `jsonb` becomes a JS object; `JSON.parse` turns `1.10` into `1.1` and rounds integers above 2^53, and `jsonb` keeps both exactly.

So rows travel as text built by Postgres and are loaded back by Postgres. The first version of the insert then failed with `cannot call jsonb_populate_recordset on a non-array`.

## What didn't work
```ts
await tx`insert into public.housing_activity_log
  select * from jsonb_populate_recordset(null::public.housing_activity_log, ${json}::jsonb)`; // json is a string
```
With a `::jsonb` cast, Postgres reports the parameter's type as `jsonb`, and postgres.js serializes a `jsonb` parameter with `JSON.stringify`. A string that already holds JSON therefore arrives as one JSON string scalar (`"[{\"id\":1,…}]"`), not an array.

## What to do
Read each table as one `jsonb_agg(to_jsonb(t))::text` inside the snapshot transaction (in UTC, so timestamps print the same on both sides). Bind the text with a `::text` cast first, so postgres.js sends it as plain text and Postgres does the parsing:

```ts
// source (server/src/import/source.ts)
tx`select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)::text as rows from ${tx(`public.${table}`)} t`
// target (server/src/import/target.ts)
tx`insert into ${tx(`public.${table}`)}
   select * from jsonb_populate_recordset(null::${tx(`public.${table}`)}, ${json}::text::jsonb)`
```

- Pass tables you don't need to change (serial changes, the log) through as the text you read; never `JSON.parse` them.
- Tables you must change (records' photo URLs) can be parsed. Timestamps stay strings in that JSON, so nothing is lost as long as no column holds a fractional number or a huge integer.
- `jsonb_populate_recordset` fills a missing key with `NULL`, not the column default, so supply every `NOT NULL` column (for example `updated_at` on admins).

## How to prevent it
The import test compares `(to_jsonb(t))::text` per row on both sides, with a log row whose `details` holds `1.10` and `12345678901234567890` and timestamps with microseconds (`server/test/import/import.test.ts`). A JS round trip anywhere in the path fails it.

## Files
- `server/src/import/source.ts`
- `server/src/import/target.ts`
- `server/test/import/import.test.ts`
