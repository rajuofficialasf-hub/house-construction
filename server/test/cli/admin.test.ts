import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { login } from '../../src/auth/service.js';
import { appDb, ownerDb, resetTestData } from '../support/db.js';
import { testOwnerUrl } from '../support/env.js';

// The admin CLI as an operator runs it, with the password piped to its prompt.

const app = appDb();
const owner = ownerDb();
const PASSWORD = 'correct horse battery staple';
const serverDir = fileURLToPath(new URL('../..', import.meta.url));
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

beforeEach(() => resetTestData(owner));
afterAll(() => Promise.all([app.end(), owner.end()]));

function cli(args: string[], stdin = ''): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = execFile(
      tsx,
      ['src/cli/admin.ts', ...args],
      { cwd: serverDir, env: { ...process.env, DATABASE_MIGRATION_URL: testOwnerUrl } },
      (err, stdout, stderr) => resolve({ code: err ? Number(err.code ?? 1) : 0, stdout, stderr }),
    );
    child.stdin?.end(stdin);
  });
}

describe('admin CLI', () => {
  it('creates an admin who can then log in', async () => {
    const res = await cli(['create', '--email', 'cli@example.org', '--name', 'সিএলআই'], `${PASSWORD}\n`);
    expect(res).toMatchObject({ code: 0, stderr: '' });
    expect(res.stdout).toContain('cli@example.org');
    expect(res.stdout).not.toContain(PASSWORD);
    expect((await login({ sql: app, now: () => new Date() }, 'cli@example.org', PASSWORD)).ok).toBe(true);
  });

  it('never takes a password as an argument', async () => {
    const res = await cli(['create', '--email', 'cli@example.org', '--password', PASSWORD]);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/--password/);
    expect(await owner`select count(*)::int as n from public.housing_admins`).toEqual([{ n: 0 }]);
  });

  it('refuses a short password and creates nothing', async () => {
    const res = await cli(['create', '--email', 'cli@example.org'], 'short\n');
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/12/);
    expect(await owner`select count(*)::int as n from public.housing_admins`).toEqual([{ n: 0 }]);
  });

  it('prints usage for an unknown command', async () => {
    const res = await cli(['promote', '--email', 'cli@example.org']);
    expect(res.code).toBe(1);
    expect(res.stderr).toMatch(/usage/i);
  });

  it('sets a new password that replaces the old one', async () => {
    await cli(['create', '--email', 'cli@example.org'], `${PASSWORD}\n`);
    const res = await cli(['set-password', '--email', 'cli@example.org'], 'a different long passphrase\n');
    expect(res.code).toBe(0);
    const deps = { sql: app, now: () => new Date() };
    expect((await login(deps, 'cli@example.org', PASSWORD)).ok).toBe(false);
    expect((await login(deps, 'cli@example.org', 'a different long passphrase')).ok).toBe(true);
  });

  it('disables an admin and enables them again', async () => {
    await cli(['create', '--email', 'cli@example.org'], `${PASSWORD}\n`);
    const deps = { sql: app, now: () => new Date() };
    expect((await cli(['disable', '--email', 'cli@example.org'])).code).toBe(0);
    expect(await login(deps, 'cli@example.org', PASSWORD)).toEqual({ ok: false, reason: 'disabled' });
    expect((await cli(['enable', '--email', 'cli@example.org'])).code).toBe(0);
    expect((await login(deps, 'cli@example.org', PASSWORD)).ok).toBe(true);
  });

  it('creates a main_admin, refuses a second, and lists the roles', async () => {
    expect((await cli(['create', '--email', 'main@example.org', '--role', 'main_admin'], `${PASSWORD}\n`)).code).toBe(0);
    const second = await cli(['create', '--email', 'second@example.org', '--role', 'main_admin'], `${PASSWORD}\n`);
    expect(second.code).toBe(1);
    expect(second.stderr).toMatch(/main@example\.org/);
    expect((await cli(['create', '--email', 'plain@example.org'], `${PASSWORD}\n`)).code).toBe(0);
    const res = await cli(['list']);
    expect(res.stdout).toMatch(/main@example\.org.*main_admin/);
    expect(res.stdout).toMatch(/plain@example\.org.*\badmin\b/);
  });

  it('refuses an invalid role before touching the database', async () => {
    const res = await cli(['create', '--email', 'cli@example.org', '--role', 'root'], `${PASSWORD}\n`);
    expect(res.code).toBe(1);
    // The CLI's own message, not the database CHECK's, proves the CLI caught it first.
    expect(res.stderr.trim()).toBe('the role must be admin or main_admin, got root');
    expect(await owner`select count(*)::int as n from public.housing_admins`).toEqual([{ n: 0 }]);
  });

  it('moves the main_admin role with set-role', async () => {
    await cli(['create', '--email', 'a@example.org', '--role', 'main_admin'], `${PASSWORD}\n`);
    await cli(['create', '--email', 'b@example.org'], `${PASSWORD}\n`);
    expect((await cli(['set-role', '--email', 'a@example.org', '--role', 'admin'])).code).toBe(0);
    const res = await cli(['set-role', '--email', 'b@example.org', '--role', 'main_admin']);
    expect(res).toMatchObject({ code: 0 });
    expect(await owner`select email from public.housing_admins where role = 'main_admin'`).toEqual([{ email: 'b@example.org' }]);
    const unknown = await cli(['set-role', '--email', 'nobody@example.org', '--role', 'admin']);
    expect(unknown.code).toBe(1);
  });

  it('disables and lists admins', async () => {
    await cli(['create', '--email', 'cli@example.org'], `${PASSWORD}\n`);
    expect((await cli(['disable', '--email', 'cli@example.org'])).code).toBe(0);
    const res = await cli(['list']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/cli@example\.org.*disabled.*argon2id/);
  });
});
