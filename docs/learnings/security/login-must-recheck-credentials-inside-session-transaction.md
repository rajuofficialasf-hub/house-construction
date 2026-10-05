---
title: Recheck the admin row under a lock in the transaction that creates the session, or a password change can be outrun
date: 2026-10-05
type: security
module: server/auth (login service)
severity: medium
tags: [login, sessions, race, toctou, for-update, postgres, testing, pg-locks]
applies_when: writing a login, token or "act on a credential check" flow where another path (CLI, admin screen) can change or revoke that credential
---

# Recheck the admin row under a lock in the transaction that creates the session

## What happened
`login()` read the admin row and verified the password (argon2, tens of ms) before opening the transaction that inserts the session. If `admin set-password` committed in that gap, it deleted the admin's sessions, and then the login inserted a fresh one for the old password. The CLI's promise that a new password ends every session was false for that one session. Reviews caught it; no test did, because every test ran the steps one after another.

## What to do
In the session transaction, lock the row and require that it is still the row you checked. If it changed, fail the login:

```ts
const [unchanged] = await tx`select 1 from public.housing_admins
  where id = ${admin.id} and password_hash = ${row.password_hash} and disabled_at is null for update`;
if (!unchanged) return undefined; // login reports reason 'changed', same 401 to the client
```

The CLI also takes `select … for update` on the row before it changes anything (`changeAdmin` in `server/src/auth/admins.ts`), so the two paths serialize. Whichever runs second sees the other's result. `FOR UPDATE` needs UPDATE privilege on at least one column; `housing_app` has `update (password_hash, updated_at)`.

## Why
Hashing has to happen outside the transaction, so a slow CPU step doesn't hold a row lock. That leaves a gap between check and use. A guarded `update … where password_hash = <old>` for the bcrypt upgrade isn't enough: when it matches 0 rows, nothing stops the session insert after it.

## How to prevent it
Test the race deterministically with a held lock, not with timing:

```ts
const [pending] = await owner.begin(async (tx) => {
  await tx`select 1 from public.housing_admins where id = ${id} for update`; // play the CLI
  const pending = login(deps, email, PASSWORD);   // password check passes, then blocks on the lock
  await waitForBlockedQuery(tx);                  // poll pg_locks where not granted
  await tx`update public.housing_admins set password_hash = ${newHash} where id = ${id}`;
  return [pending];                               // wrap it: a returned promise would be awaited inside the tx
});
expect(await pending).toEqual({ ok: false, reason: 'changed' });
```

Two traps:
- **Poll through `tx`, not the pool.** `ownerDb()` in `server/test/support/db.ts` has `max: 1`. A `pg_locks` query through `owner` waits for the connection the transaction holds, so the test hangs forever.
- **Mutation-check it.** Drop the `password_hash`/`disabled_at` conditions and confirm the test goes red. It did, which is how we know it tests the race and not the happy path.

## Files
- `server/src/auth/service.ts`
- `server/src/auth/admins.ts`
- `server/test/auth/service.test.ts`
