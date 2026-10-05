import { randomBytes } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertAdmin, ownerDb, resetTestData } from '../support/db.js';

// Tables from server/db/migrations/0007_admin_auth.sql: what the API role may and may not do
// with admins and sessions. Only the admin CLI, connecting as the owner, creates or changes admins.

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

const INSUFFICIENT_PRIVILEGE = { code: '42501' };
const CHECK_VIOLATION = { code: '23514' };

async function insertSession(adminId: string, tokenHash: Buffer = randomBytes(32)) {
  const now = new Date();
  await app`insert into public.housing_admin_sessions (token_hash, admin_id, created_at, last_seen_at, expires_at)
    values (${tokenHash}, ${adminId}, ${now}, ${now}, ${new Date(now.getTime() + 60_000)})`;
  return tokenHash;
}

describe('housing_admins', () => {
  it('gives each admin a uuid id', async () => {
    const admin = await insertAdmin(owner);
    expect(admin.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('stores emails lower-cased only, and each once', async () => {
    await expect(insertAdmin(owner, { email: 'Admin@Example.org' })).rejects.toMatchObject(CHECK_VIOLATION);
    await insertAdmin(owner, { email: 'admin@example.org' });
    await expect(insertAdmin(owner, { email: 'admin@example.org' })).rejects.toMatchObject({ code: '23505' });
  });

  it('lets the API role read admins and replace a password hash', async () => {
    const admin = await insertAdmin(owner);
    expect(await app`select email, password_hash from public.housing_admins`).toEqual([
      { email: admin.email, password_hash: 'not-a-hash' },
    ]);
    await app`update public.housing_admins set password_hash = 'new', updated_at = now() where id = ${admin.id}`;
    expect(await app`select password_hash from public.housing_admins`).toEqual([{ password_hash: 'new' }]);
  });

  it('does not let the API role create, enable, rename or delete admins', async () => {
    const admin = await insertAdmin(owner, { disabled: true });
    await expect(
      app`insert into public.housing_admins (email, password_hash) values ('x@example.org', 'h')`,
    ).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`update public.housing_admins set disabled_at = null where id = ${admin.id}`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`update public.housing_admins set email = 'x@example.org' where id = ${admin.id}`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
    await expect(app`delete from public.housing_admins where id = ${admin.id}`).rejects.toMatchObject(INSUFFICIENT_PRIVILEGE);
  });
});

describe('housing_admin_sessions', () => {
  it('lets the API role create, read, update and delete sessions', async () => {
    const admin = await insertAdmin(owner);
    const hash = await insertSession(admin.id);
    await app`update public.housing_admin_sessions set last_seen_at = now() where token_hash = ${hash}`;
    expect(await app`select admin_id from public.housing_admin_sessions`).toEqual([{ admin_id: admin.id }]);
    await app`delete from public.housing_admin_sessions where token_hash = ${hash}`;
    expect(await app`select count(*)::int as n from public.housing_admin_sessions`).toEqual([{ n: 0 }]);
  });

  it('accepts only a 32-byte token hash', async () => {
    const admin = await insertAdmin(owner);
    await expect(insertSession(admin.id, randomBytes(31))).rejects.toMatchObject(CHECK_VIOLATION);
  });

  it('removes an admin’s sessions with the admin', async () => {
    const admin = await insertAdmin(owner);
    await insertSession(admin.id);
    await owner`delete from public.housing_admins where id = ${admin.id}`;
    expect(await app`select count(*)::int as n from public.housing_admin_sessions`).toEqual([{ n: 0 }]);
  });
});
