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

  it('disables and lists admins', async () => {
    await cli(['create', '--email', 'cli@example.org'], `${PASSWORD}\n`);
    expect((await cli(['disable', '--email', 'cli@example.org'])).code).toBe(0);
    const res = await cli(['list']);
    expect(res.code).toBe(0);
    expect(res.stdout).toMatch(/cli@example\.org.*disabled/);
  });
});
