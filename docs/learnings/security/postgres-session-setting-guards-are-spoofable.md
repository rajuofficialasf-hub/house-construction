---
title: A guard that trusts a session setting can be switched off by any role; check current_user against session_user instead
date: 2026-10-05
type: security
module: server/db (PostgreSQL triggers and security definer functions)
severity: high
tags: [postgres, security-definer, set-config, guc, triggers, supabase-port, privileges]
applies_when: porting Supabase SQL, or writing a trigger that allows an action only when called through a specific function
---

# A guard that trusts a session setting can be switched off by any role

## What happened
`housing_protect_serial` (trigger) refused direct changes to `serial_no` unless the session setting `housing.allow_serial_change` was `on`, which `housing_change_serial()` sets around its own update. Any role can set a custom setting, so `housing_app` could change a serial directly and skip the audit row and the counter bump:

```sql
select set_config('housing.allow_serial_change', 'on', true);
update housing_beneficiaries set serial_no = 999 where ...;  -- allowed
```

On Supabase the same hole existed, but PostgREST clients can't run arbitrary `set_config`, so it never showed. Once the API connects with a real role that has UPDATE on the table, an SQL injection or a buggy route can use it.

## What to do
Honor the setting only inside a security definer function. There, `current_user` is the function owner and differs from `session_user` (the login role). A direct statement from the app has them equal:

```sql
if new.serial_no is distinct from old.serial_no
   and (coalesce(current_setting('housing.allow_serial_change', true), '') <> 'on'
        or current_user = session_user) then
  raise exception '...' using errcode = '23514';
end if;
```

The same rule applies when recording "who did it". Inside a definer function `current_user` is the owner, so a fallback actor must use `session_user` (see `housing_current_actor()`).

## Why
Custom settings (`a.b`) have no privileges: any role can set them with `set_config` or `SET`. Only role identity is controlled by the database, and `current_user <> session_user` is true only while a security definer function runs. The app role has no CREATE on the schema, so it can't define its own definer function to fake this.

This doesn't protect values the app is meant to set. `app.actor_id` and `app.actor_email` come from the API, so the activity log is only as trustworthy as the API process. Set them in one place (`withActor()` in `server/src/db.ts`).

## How to prevent it
- For every `current_setting(...)` used as a permission check in ported SQL, ask "can the app role set this itself?". If yes, add a role check.
- Keep a test that tries the bypass as the app role: `cannot unlock a direct serial change by setting the session flag itself` in `server/test/db/privileges.test.ts`.

## Files
- `server/db/migrations/0002_serial.sql` (`housing_protect_serial`, `housing_current_actor`)
- `server/test/db/privileges.test.ts`
- `server/test/db/activity-log.test.ts` (`records the login role when no actor is set`)
