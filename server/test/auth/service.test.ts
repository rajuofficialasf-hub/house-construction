import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword, verifyDummy } from '../../src/auth/password.js';
import type { Tx } from '../../src/db.js';
import { login, logout } from '../../src/auth/service.js';
import { authenticate } from '../../src/auth/session.js';
import { appDb, insertAdmin, ownerDb, resetTestData } from '../support/db.js';

// Login, session lookup and logout against the real test database, with a hand-moved clock.

// The real dummy check, wrapped so tests can see that failed logins pay for one.
vi.mock('../../src/auth/password.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/auth/password.js')>();
  return { ...real, verifyDummy: vi.fn(real.verifyDummy) };
});

const app = appDb();
const owner = ownerDb();
const PASSWORD = 'correct horse battery staple';
// Made with `htpasswd -bnBC 4 "" '<PASSWORD>'`, in Supabase's $2a$ form.
const BCRYPT = '$2a$04$3sT/02Uk5y8iNB43czyld.4GpULJCsGSmTyFBKCMXL4pyEh8/be7K';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let clock = new Date('2026-10-05T08:00:00Z');
const deps = { sql: app, now: () => clock };
let argonHash: string;

beforeAll(async () => {
  argonHash = await hashPassword(PASSWORD);
});
beforeEach(async () => {
  vi.mocked(verifyDummy).mockClear();
  clock = new Date('2026-10-05T08:00:00Z');
  await resetTestData(owner);
});
afterAll(() => Promise.all([app.end(), owner.end()]));

const sha256 = (token: string) => createHash('sha256').update(token).digest();

async function sessions() {
  return owner`select token_hash, admin_id, created_at, last_seen_at, expires_at from public.housing_admin_sessions order by created_at`;
}

async function activity() {
  return owner`select actor_id, actor_email, action from public.housing_activity_log order by id`;
}

/** Resolves once some query on the test database is waiting for a lock. */
async function waitForBlockedQuery(sql: Tx) {
  for (let i = 0; i < 200; i++) {
    const [row] = await sql`select count(*)::int as n from pg_locks where not granted`;
    if ((row?.n as number) > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('no query blocked on a lock');
}

async function loggedIn(email = 'admin@example.org') {
  const result = await login(deps, email, PASSWORD);
  if (!result.ok) throw new Error(`login failed: ${result.reason}`);
  return result;
}

describe('login', () => {
  it('creates a session holding only the token hash, and logs the login as the admin', async () => {
    const admin = await insertAdmin(owner, { passwordHash: argonHash });
    const result = await loggedIn();
    expect(result.admin).toEqual({ id: admin.id, email: 'admin@example.org', name: 'এডমিন' });
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt).toEqual(new Date('2026-10-12T08:00:00Z'));
    expect(await sessions()).toEqual([
      {
        token_hash: sha256(result.token),
        admin_id: admin.id,
        created_at: clock,
        last_seen_at: clock,
        expires_at: new Date('2026-10-12T08:00:00Z'),
      },
    ]);
    expect(await activity()).toEqual([{ actor_id: admin.id, actor_email: admin.email, action: 'login' }]);
  });

  it('finds the admin whatever the case of the email typed', async () => {
    await insertAdmin(owner, { passwordHash: argonHash });
    expect((await login(deps, 'Admin@Example.ORG', PASSWORD)).ok).toBe(true);
  });

  it.each([
    ['an unknown email', 'nobody@example.org', PASSWORD, 'unknown'],
    ['a wrong password', 'admin@example.org', 'wrong password', 'bad_password'],
    ['a disabled admin', 'off@example.org', PASSWORD, 'disabled'],
  ])('refuses %s without a session or an activity row', async (_case, email, password, reason) => {
    await insertAdmin(owner, { passwordHash: argonHash });
    await insertAdmin(owner, { email: 'off@example.org', passwordHash: argonHash, disabled: true });
    expect(await login(deps, email, password)).toEqual({ ok: false, reason });
    expect(await sessions()).toEqual([]);
    expect(await activity()).toEqual([]);
  });

  it('spends one password check on an unknown or disabled email, and none on a real admin', async () => {
    await insertAdmin(owner, { passwordHash: argonHash });
    await insertAdmin(owner, { email: 'off@example.org', passwordHash: argonHash, disabled: true });
    await login(deps, 'nobody@example.org', PASSWORD);
    await login(deps, 'off@example.org', PASSWORD);
    expect(verifyDummy).toHaveBeenCalledTimes(2);
    await login(deps, 'admin@example.org', 'wrong password');
    await loggedIn();
    expect(verifyDummy).toHaveBeenCalledTimes(2);
  });

  it('starts no session when the CLI replaces the password while the login is checking it', async () => {
    const admin = await insertAdmin(owner, { passwordHash: argonHash });
    const newHash = await hashPassword('a different long passphrase');
    // The owner holds the admin row the way the CLI does, so the login's transaction waits on it.
    const attempt = owner.begin(async (tx) => {
      await tx`select 1 from public.housing_admins where id = ${admin.id} for update`;
      const pending = login(deps, 'admin@example.org', PASSWORD);
      await waitForBlockedQuery(tx);
      await tx`update public.housing_admins set password_hash = ${newHash} where id = ${admin.id}`;
      await tx`delete from public.housing_admin_sessions where admin_id = ${admin.id}`;
      return [pending];
    });
    const [pending] = await attempt;
    expect(await pending).toEqual({ ok: false, reason: 'changed' });
    expect(await sessions()).toEqual([]);
    expect(await owner`select password_hash from public.housing_admins`).toEqual([{ password_hash: newHash }]);
  });

  it('replaces an imported bcrypt hash with argon2id at login', async () => {
    await insertAdmin(owner, { passwordHash: BCRYPT });
    await loggedIn();
    const [row] = await owner`select password_hash from public.housing_admins`;
    expect(row?.password_hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    clock = new Date(clock.getTime() + 1000);
    expect((await login(deps, 'admin@example.org', PASSWORD)).ok).toBe(true);
  });

  it('leaves an up-to-date hash alone', async () => {
    await insertAdmin(owner, { passwordHash: argonHash });
    await loggedIn();
    expect(await owner`select password_hash from public.housing_admins`).toEqual([{ password_hash: argonHash }]);
  });

  it('issues a new token on each login', async () => {
    await insertAdmin(owner, { passwordHash: argonHash });
    const first = await loggedIn();
    const second = await loggedIn();
    expect(first.token).not.toBe(second.token);
    expect(await sessions()).toHaveLength(2);
  });

  it('clears out a session past its 7 days even if it was used recently', async () => {
    const admin = await insertAdmin(owner, { passwordHash: argonHash });
    const old = await loggedIn();
    clock = new Date(clock.getTime() + 7 * DAY + 1000);
    // Seen an hour ago, so only the absolute limit has passed.
    await owner`update public.housing_admin_sessions set last_seen_at = ${new Date(clock.getTime() - HOUR)}`;
    await loggedIn();
    const rows = await sessions();
    expect(rows.filter((r) => r.admin_id === admin.id)).toHaveLength(1);
    expect(rows.map((r) => r.token_hash)).not.toContainEqual(sha256(old.token));
  });

  it('clears out that admin’s expired sessions, and no one else’s', async () => {
    const admin = await insertAdmin(owner, { passwordHash: argonHash });
    await insertAdmin(owner, { email: 'other@example.org', passwordHash: argonHash });
    await loggedIn();
    await loggedIn('other@example.org');
    clock = new Date(clock.getTime() + 9 * HOUR);
    const fresh = await loggedIn();
    const rows = await sessions();
    expect(rows.map((r) => r.token_hash)).toContainEqual(sha256(fresh.token));
    expect(rows.filter((r) => r.admin_id === admin.id)).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });
});

describe('authenticate', () => {
  it('returns the admin for a live session and slides its idle window', async () => {
    const admin = await insertAdmin(owner, { passwordHash: argonHash });
    const { token } = await loggedIn();
    clock = new Date(clock.getTime() + 7 * HOUR);
    expect(await authenticate(deps, sha256(token))).toEqual({ id: admin.id, email: admin.email, name: 'এডমিন' });
    const [row] = await sessions();
    expect(row?.last_seen_at).toEqual(clock);
    // Seven more hours is 14 h after login but only 7 h idle, so the session still holds.
    clock = new Date(clock.getTime() + 7 * HOUR);
    expect(await authenticate(deps, sha256(token))).not.toBeNull();
  });

  it('ends a session idle for more than 8 hours', async () => {
    await insertAdmin(owner, { passwordHash: argonHash });
    const { token } = await loggedIn();
    clock = new Date(clock.getTime() + 8 * HOUR + 1000);
    expect(await authenticate(deps, sha256(token))).toBeNull();
  });

  it('ends a session 7 days after login even while it is in use', async () => {
    await insertAdmin(owner, { passwordHash: argonHash });
    const { token } = await loggedIn();
    for (let hours = 6; hours < 7 * 24; hours += 6) {
      clock = new Date(Date.parse('2026-10-05T08:00:00Z') + hours * HOUR);
      expect(await authenticate(deps, sha256(token))).not.toBeNull();
    }
    clock = new Date(Date.parse('2026-10-05T08:00:00Z') + 7 * DAY + 1000);
    expect(await authenticate(deps, sha256(token))).toBeNull();
  });

  it('refuses the session of an admin disabled after login', async () => {
    const admin = await insertAdmin(owner, { passwordHash: argonHash });
    const { token } = await loggedIn();
    await owner`update public.housing_admins set disabled_at = now() where id = ${admin.id}`;
    expect(await authenticate(deps, sha256(token))).toBeNull();
  });

  it('refuses an unknown token', async () => {
    await insertAdmin(owner, { passwordHash: argonHash });
    await loggedIn();
    expect(await authenticate(deps, sha256('made-up'))).toBeNull();
  });
});

describe('logout', () => {
  it('ends only that session and logs the logout as the admin', async () => {
    const admin = await insertAdmin(owner, { passwordHash: argonHash });
    const first = await loggedIn();
    const second = await loggedIn();
    await logout(deps, first.admin, sha256(first.token));
    expect(await authenticate(deps, sha256(first.token))).toBeNull();
    expect(await authenticate(deps, sha256(second.token))).not.toBeNull();
    expect((await activity()).map((r) => [r.action, r.actor_id])).toEqual([
      ['login', admin.id],
      ['login', admin.id],
      ['logout', admin.id],
    ]);
  });
});
