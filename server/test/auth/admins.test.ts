import { createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { AdminCliError, createAdmin, listAdmins, setDisabled, setPassword } from '../../src/auth/admins.js';
import { verifyPassword } from '../../src/auth/password.js';
import { login } from '../../src/auth/service.js';
import { authenticate } from '../../src/auth/session.js';
import { appDb, ownerDb, resetTestData } from '../support/db.js';

// Admin management as the admin CLI does it: connected as the owner, never through the API.

const app = appDb();
const owner = ownerDb();
const PASSWORD = 'correct horse battery staple';
const NEW_PASSWORD = 'a different long passphrase';
const deps = { sql: app, now: () => new Date() };

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const sha256 = (token: string) => createHash('sha256').update(token).digest();

async function tokenFor(email: string, password = PASSWORD) {
  const result = await login(deps, email, password);
  if (!result.ok) throw new Error(result.reason);
  return result.token;
}

async function activity() {
  return owner`select actor_id, actor_email, action, details from public.housing_activity_log order by id`;
}

describe('createAdmin', () => {
  it('stores a lower-cased email and an argon2id hash, and logs it as done from the server', async () => {
    const admin = await createAdmin(owner, { email: 'New@Example.org', name: 'নতুন', password: PASSWORD });
    expect(admin).toMatchObject({ email: 'new@example.org', name: 'নতুন' });
    const [row] = await owner`select password_hash from public.housing_admins where id = ${admin.id}`;
    expect(row?.password_hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(row?.password_hash as string, PASSWORD)).toBe(true);
    expect(await activity()).toEqual([
      { actor_id: null, actor_email: 'housing_owner', action: 'admin_create', details: { email: 'new@example.org' } },
    ]);
  });

  it('refuses an email that already has an admin', async () => {
    await createAdmin(owner, { email: 'a@example.org', password: PASSWORD });
    await expect(createAdmin(owner, { email: 'A@example.org', password: PASSWORD })).rejects.toThrow(AdminCliError);
  });

  it.each([
    ['a malformed email', { email: 'nope', password: PASSWORD }],
    ['an 11-character password', { email: 'a@example.org', password: 'x'.repeat(11) }],
    ['a 201-character password', { email: 'a@example.org', password: 'x'.repeat(201) }],
  ])('refuses %s and stores nothing', async (_case, input) => {
    await expect(createAdmin(owner, input)).rejects.toThrow(AdminCliError);
    expect(await listAdmins(owner)).toEqual([]);
  });
});

describe('setPassword', () => {
  it('replaces the password and ends only that admin’s sessions', async () => {
    await createAdmin(owner, { email: 'a@example.org', password: PASSWORD });
    await createAdmin(owner, { email: 'b@example.org', password: PASSWORD });
    const aToken = await tokenFor('a@example.org');
    const bToken = await tokenFor('b@example.org');
    await setPassword(owner, 'a@example.org', NEW_PASSWORD);
    expect(await authenticate(deps, sha256(aToken))).toBeNull();
    expect(await authenticate(deps, sha256(bToken))).not.toBeNull();
    expect((await login(deps, 'a@example.org', PASSWORD)).ok).toBe(false);
    expect((await login(deps, 'a@example.org', NEW_PASSWORD)).ok).toBe(true);
    expect((await activity()).map((r) => r.action)).toContain('admin_password_set');
  });

  it('refuses an unknown email', async () => {
    await expect(setPassword(owner, 'nobody@example.org', NEW_PASSWORD)).rejects.toThrow(AdminCliError);
  });
});

describe('setDisabled', () => {
  it('disables an admin, ending their sessions, and enables them again with the old password', async () => {
    await createAdmin(owner, { email: 'a@example.org', password: PASSWORD });
    const token = await tokenFor('a@example.org');
    await setDisabled(owner, 'a@example.org', true);
    expect(await authenticate(deps, sha256(token))).toBeNull();
    expect(await owner`select count(*)::int as n from public.housing_admin_sessions`).toEqual([{ n: 0 }]);
    expect((await login(deps, 'a@example.org', PASSWORD)).ok).toBe(false);
    await setDisabled(owner, 'a@example.org', false);
    expect((await login(deps, 'a@example.org', PASSWORD)).ok).toBe(true);
    expect((await activity()).map((r) => r.action)).toEqual(['admin_create', 'login', 'admin_disable', 'admin_enable', 'login']);
  });

  it('refuses an unknown email', async () => {
    await expect(setDisabled(owner, 'nobody@example.org', true)).rejects.toThrow(AdminCliError);
  });
});

describe('listAdmins', () => {
  it('lists admins by email without their hashes', async () => {
    await createAdmin(owner, { email: 'b@example.org', password: PASSWORD });
    await createAdmin(owner, { email: 'a@example.org', name: 'এ', password: PASSWORD });
    await setDisabled(owner, 'b@example.org', true);
    const admins = await listAdmins(owner);
    expect(admins.map(({ email, name, disabled }) => ({ email, name, disabled }))).toEqual([
      { email: 'a@example.org', name: 'এ', disabled: false },
      { email: 'b@example.org', name: null, disabled: true },
    ]);
    // The hash kind is listed; the hash itself never is.
    expect(admins.map((a) => a.hash)).toEqual(['argon2id', 'argon2id']);
    expect(JSON.stringify(admins)).not.toContain('$argon2');
  });
});
