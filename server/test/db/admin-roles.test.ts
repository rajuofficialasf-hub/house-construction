import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { appDb, insertAdmin, ownerDb, resetTestData } from '../support/db.js';

// The admin role from server/db/migrations/0012_admin_roles.sql: admin or main_admin, at most one
// main_admin, and only the owner (the admin CLI) may change it.

const app = appDb();
const owner = ownerDb();

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

describe('housing_admins.role', () => {
  it('defaults to admin', async () => {
    await owner`insert into public.housing_admins (email, password_hash) values ('plain@example.org', 'x')`;
    const [row] = await owner`select role from public.housing_admins where email = 'plain@example.org'`;
    expect(row?.role).toBe('admin');
  });

  it('refuses an unknown role', async () => {
    await expect(owner`insert into public.housing_admins (email, password_hash, role) values ('x@example.org', 'x', 'root')`)
      .rejects.toMatchObject({ code: '23514' });
  });

  it('allows only one main_admin', async () => {
    await insertAdmin(owner, { email: 'main@example.org', role: 'main_admin' });
    await expect(insertAdmin(owner, { email: 'second@example.org', role: 'main_admin' })).rejects.toMatchObject({ code: '23505' });
    await expect(insertAdmin(owner, { email: 'plain@example.org' })).resolves.toMatchObject({ role: 'admin' });
  });

  it('is not writable by the runtime role', async () => {
    const admin = await insertAdmin(owner);
    await expect(app`update public.housing_admins set role = 'main_admin' where id = ${admin.id}`).rejects.toMatchObject({
      code: '42501',
    });
  });
});
