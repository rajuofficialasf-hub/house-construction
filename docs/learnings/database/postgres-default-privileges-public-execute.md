---
title: Revoking PUBLIC EXECUTE on future functions must be database-wide; IN SCHEMA silently does nothing
date: 2026-10-05
type: database
module: server/db (role grants)
severity: medium
tags: [postgres, default-privileges, grants, public, functions, security-definer]
applies_when: locking down which roles can call functions, especially security definer ones added by later migrations
---

# Revoking PUBLIC EXECUTE on future functions must be database-wide

## What happened
PostgreSQL gives `EXECUTE` to `PUBLIC` on every new function. `0006_app_role_grants.sql` revoked it for existing functions, and a later migration's security definer function would have been callable by every role. The first fix ran without error but had no effect:

```sql
alter default privileges in schema public revoke execute on functions from public;  -- no effect
```

The test that creates a function as the owner and checks its ACL still found a PUBLIC grant.

## What to do
Revoke the default for the owner role across the whole database (no `IN SCHEMA`). Run it as the role that creates the functions, which in a migration is the migration owner:

```sql
revoke execute on all functions in schema public from public;     -- functions that exist now
alter default privileges revoke execute on functions from public; -- functions created later by this role
```

Down migration: `alter default privileges grant execute on functions to public;`

## Why
The built-in PUBLIC grant is a global default. Per-schema default privileges can only add privileges on top of the global ones, never remove them, and PostgreSQL doesn't warn. The [ALTER DEFAULT PRIVILEGES docs](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html) say this, but it's easy to miss.

## How to prevent it
Test both cases against a real database, not only the current state:
- `grants no function to PUBLIC`: no function in `public` has a PUBLIC EXECUTE entry (`aclexplode(coalesce(proacl, acldefault('f', proowner)))`, grantee `0`).
- `keeps functions added by later migrations away from PUBLIC`: create a function as the owner inside a rolled-back transaction and check the same query.

## Files
- `server/db/migrations/0006_app_role_grants.sql`
- `server/test/db/privileges.test.ts`
