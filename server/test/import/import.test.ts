import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { listAdmins } from '../../src/auth/admins.js';
import { login } from '../../src/auth/service.js';
import { withActor } from '../../src/db.js';
import { mapAdmins } from '../../src/import/admins.js';
import { checkSource, openSource, readSnapshot } from '../../src/import/source.js';
import { checkTarget, NO_PHOTOS, writeImport, type TargetOptions } from '../../src/import/target.js';
import { createNasDriver } from '../../src/storage/drivers/nas.js';
import { appDb, insertAdmin, insertRecord, ownerDb, resetTestData } from '../support/db.js';
import { testOwnerUrl } from '../support/env.js';
import { importCli } from '../support/import-cli.js';
import { insertSourceRecord, insertSourceUser, resetSource, setSourceCounter, sourceDb, testSourceUrl } from '../support/source.js';

// The Supabase import (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md) from the local source
// stand-in into housing_test: records, counters, serial changes, the activity log and admins.

const app = appDb();
const owner = ownerDb();
const src = sourceDb();
const PASSWORD = 'admins current supabase password';
let work = '';

beforeEach(async () => {
  await Promise.all([resetTestData(owner), resetSource(src)]);
  work = await mkdtemp(path.join(os.tmpdir(), 'housing-import-test-'));
});
afterEach(() => rm(work, { recursive: true, force: true }));
afterAll(() => Promise.all([app.end(), owner.end(), src.end()]));

const reportPath = () => path.join(work, `report-${randomUUID()}.json`);
const nasEnv = () => ({ STORAGE_ROOT: path.join(work, 'storage') });
const TARGET = '127.0.0.1:5432/housing_test';
const NO_PHOTO_BASE = 'http://127.0.0.1:9/storage/v1/object/public/housing-photos/';
const runImport = (extra: string[] = [], stdin = `${testSourceUrl}\n`) =>
  importCli(['import', '--report', reportPath(), '--photo-base', NO_PHOTO_BASE, ...extra], stdin, nasEnv());

/** Every row of a table as to_jsonb text, in id order: equal text means equal data, to the microsecond. */
async function tableText(sql: typeof owner, table: string, drop: string[] = []): Promise<string[]> {
  const rows = await sql<{ row: string }[]>`
    select (to_jsonb(t) - ${drop}::text[])::text as row from ${sql(`public.${table}`)} t order by 1`;
  return rows.map((r) => r.row);
}

/** A source with gaps in its serials, a serial change, log rows with exact numbers in details, and five admins. */
async function seedSource() {
  const first = await insertSourceRecord(src, { serial_no: 1 });
  await insertSourceRecord(src, { serial_no: 2, photo_updated_at: '2025-03-04 05:06:07.000001+00' });
  await insertSourceRecord(src, { serial_no: 4 });
  await insertSourceRecord(src, { project_type: 'tin', serial_no: 1 });
  await setSourceCounter(src, 'semi_pucca', 5); // serials 3 and 5 were deleted and are never reused
  await setSourceCounter(src, 'tin', 1);
  const admin = await insertSourceUser(src, { email: 'Admin@Example.org', password: PASSWORD, name: 'প্রধান এডমিন' });
  await src`insert into public.housing_serial_changes (record_id, project_type, old_serial, new_serial, changed_by, changed_at)
            values (${first}, 'semi_pucca', 7, 1, ${admin}, '2025-05-06 07:08:09.101112+00')`;
  await src`insert into public.housing_activity_log (at, actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details)
            values ('2025-05-06 07:08:09.101112+00', ${admin}, 'admin@example.org', 'serial_change', 'semi_pucca', ${first}, 1, 'নাম 1',
                    '{"old": 7, "new": 1, "ratio": 1.10, "big": 12345678901234567890}'),
                   ('2025-05-07 00:00:00+00', ${admin}, 'admin@example.org', 'login', null, null, null, null, '{}')`;
  const ids = {
    admin,
    deleted: await insertSourceUser(src, { email: 'gone@example.org', password: PASSWORD, deleted: true }),
    banned: await insertSourceUser(src, { email: 'banned@example.org', password: PASSWORD, banned: true }),
    badEmail: await insertSourceUser(src, { email: 'not an email', password: PASSWORD }),
    noHash: await insertSourceUser(src, { email: 'magic@example.org', encrypted_password: '' }),
  };
  await insertSourceUser(src, { email: 'just-a-user@example.org', password: PASSWORD, admin: false });
  return ids;
}

const OPTIONS: TargetOptions = { replace: false, discardNewWrites: false, sourceActivityMaxAt: null };

/** The import without the CLI around it. */
async function importDirect(options: Partial<TargetOptions> = {}, { withoutPasswords = false } = {}) {
  const source = openSource(testSourceUrl, undefined);
  try {
    await checkSource(source, owner);
    const snapshot = await readSnapshot(source);
    const opts = { ...OPTIONS, sourceActivityMaxAt: snapshot.activityMaxAt, ...options };
    await checkTarget(owner, opts);
    const { admins, disabled } = mapAdmins(snapshot.users, { withoutPasswords, now: new Date() });
    const result = await writeImport(owner, { snapshot, admins, photos: NO_PHOTOS }, opts);
    return { ...result, disabled, snapshot };
  } finally {
    await source.end();
  }
}

describe('import-supabase import', () => {
  it('copies records, counters, serial changes and the log exactly, without adding log rows', async () => {
    await seedSource();
    const res = await runImport();
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);

    expect(await tableText(owner, 'housing_beneficiaries')).toEqual(await tableText(src, 'housing_beneficiaries'));
    expect(await tableText(owner, 'housing_serial_changes')).toEqual(await tableText(src, 'housing_serial_changes'));
    expect(await tableText(owner, 'housing_activity_log')).toEqual(await tableText(src, 'housing_activity_log'));
    expect(await owner`select project_type, last_serial from public.housing_serial_counters order by 1`).toEqual([
      { project_type: 'semi_pucca', last_serial: 5 },
      { project_type: 'tin', last_serial: 1 },
    ]);
    const [trigger] = await owner`select tgenabled from pg_trigger where tgname = 'housing_beneficiaries_activity_log'`;
    expect(trigger?.tgenabled).toBe('O');

    expect(res.stdout).toMatch(/records semi_pucca\s+3/);
    expect(res.stdout).toContain('verify:');
    expect(res.stdout).not.toContain('FAIL');
    expect(res.stdout).not.toContain('housing_owner_local');
    expect(res.stdout).not.toMatch(/admin@example\.org|প্রধান|\$2b\$/);
  });

  it('continues serials and log ids after the imported ones, never reusing a deleted serial', async () => {
    await seedSource();
    await importDirect();
    const actor = { id: randomUUID(), email: 'new@example.org' };
    const created = await withActor(app, actor, (tx) => insertRecord(tx));
    expect(created.serial_no).toBe(6);
    const [log] = await owner<{ id: string; action: string }[]>`select id::text, action from public.housing_activity_log order by id desc limit 1`;
    expect(log).toEqual({ id: '3', action: 'create' });
    const [change] = await owner<{ next: string }[]>`select nextval(pg_get_serial_sequence('public.housing_serial_changes', 'id'))::text as next`;
    expect(change?.next).toBe('2');
  });

  it('lets an imported admin log in with the Supabase password, which then becomes argon2id', async () => {
    const ids = await seedSource();
    await importDirect();
    const admin = (await listAdmins(owner)).find((a) => a.id === ids.admin);
    expect(admin).toMatchObject({ email: 'admin@example.org', name: 'প্রধান এডমিন', disabled: false, hash: 'bcrypt' });
    expect((await login({ sql: app, now: () => new Date() }, 'Admin@Example.org', PASSWORD)).ok).toBe(true);
    expect((await listAdmins(owner)).find((a) => a.id === ids.admin)?.hash).toBe('argon2id');
  });

  it('imports admins who could not log in as disabled, and reports them by id and reason only', async () => {
    const ids = await seedSource();
    const report = reportPath();
    const res = await importCli(['import', '--report', report, '--photo-base', NO_PHOTO_BASE], `${testSourceUrl}\n`, nasEnv());
    expect(res.code).toBe(0);
    const written = JSON.parse(await readFile(report, 'utf8'));
    expect(written.admins_disabled).toEqual(
      expect.arrayContaining([
        { id: ids.deleted, reasons: ['deleted'] },
        { id: ids.banned, reasons: ['banned'] },
        { id: ids.badEmail, reasons: ['bad_email'] },
        { id: ids.noHash, reasons: ['no_bcrypt_hash'] },
      ]),
    );
    expect(written.admins_disabled).toHaveLength(4);
    expect(JSON.stringify(written)).not.toMatch(/@example\.org|\$2b\$/);
    expect(((await stat(report)).mode & 0o777).toString(8)).toBe('600');

    const admins = await listAdmins(owner);
    expect(admins).toHaveLength(5);
    expect(admins.filter((a) => !a.disabled).map((a) => a.id)).toEqual([ids.admin]);
    const [noHash] = await owner`select password_hash from public.housing_admins where id = ${ids.noHash}`;
    expect(noHash?.password_hash).toBe('!');
    expect((await login({ sql: app, now: () => new Date() }, 'banned@example.org', PASSWORD)).ok).toBe(false);
  });

  it('keeps every real hash out of the target with --without-passwords', async () => {
    await seedSource();
    await importDirect({}, { withoutPasswords: true });
    const rows = await owner<{ password_hash: string; disabled: boolean }[]>`
      select password_hash, disabled_at is not null as disabled from public.housing_admins`;
    expect(rows.every((r) => r.password_hash === '!' && r.disabled)).toBe(true);
  });

  it('stops when two admins share an email after lower-casing', async () => {
    await insertSourceUser(src, { email: 'same@example.org', password: PASSWORD });
    await insertSourceUser(src, { email: 'SAME@example.org', password: PASSWORD });
    await expect(importDirect()).rejects.toThrow(/share one email/);
    expect(await owner`select 1 from public.housing_admins`).toHaveLength(0);
  });

  it('can only read the source', async () => {
    const source = openSource(testSourceUrl, undefined);
    try {
      await expect(source`insert into public.housing_serial_changes (record_id, project_type, old_serial, new_serial) values (${randomUUID()}, 'tin', 1, 2)`).rejects.toMatchObject({ code: '25006' });
      const snapshot = await readSnapshot(source);
      expect(snapshot.timeZone).toBe('UTC');
    } finally {
      await source.end();
    }
  });

  it('leaves the target empty and its log trigger on when the transaction fails', async () => {
    await seedSource();
    await insertSourceRecord(src, { serial_no: 9, name: '   ' }); // the target's name check refuses it
    await setSourceCounter(src, 'semi_pucca', 9);
    await expect(importDirect()).rejects.toThrow();
    expect(await owner`select 1 from public.housing_beneficiaries`).toHaveLength(0);
    expect(await owner`select 1 from public.housing_admins`).toHaveLength(0);
    const [trigger] = await owner`select tgenabled from pg_trigger where tgname = 'housing_beneficiaries_activity_log'`;
    expect(trigger?.tgenabled).toBe('O');
  });
});

describe('import-supabase refusals', () => {
  it.each([
    ['a record', () => insertRecord(owner)],
    ['an admin', () => insertAdmin(owner)],
    ['a counter above zero', () => owner`update public.housing_serial_counters set last_serial = 3 where project_type = 'tin'`],
  ])('refuses a target with %s unless --replace is given', async (_what, fill) => {
    await seedSource();
    await fill();
    await expect(importDirect()).rejects.toThrow(/not empty/);
  });

  it('wipes and re-imports with --replace --confirm-db, removing the wiped files from storage', async () => {
    await seedSource();
    const storage = createNasDriver({ STORAGE_ROOT: path.join(work, 'storage') });
    await storage.put('housing/old.webp', Readable.from(Buffer.from('old')), { contentType: 'image/webp' });
    const record = await insertRecord(owner, { project_type: 'tin', serial_no: 40 });
    await owner`insert into public.housing_files (record_id, kind, variant, storage_key, storage_driver, content_type, size_bytes)
                values (${record.id}, 'prev', 'photo', 'housing/old.webp', 'nas', 'image/webp', 3)`;

    // The database name alone isn't enough: staging and production are both "housing".
    const wrongName = await runImport(['--replace', '--confirm-db', 'housing_test']);
    expect(wrongName.code).not.toBe(0);
    expect(wrongName.stderr).toContain(`--confirm-db ${TARGET}`);
    expect(await owner`select 1 from public.housing_beneficiaries where serial_no = 40`).toHaveLength(1);
    const unconfirmed = await runImport(['--replace']);
    expect(unconfirmed.code).not.toBe(0);
    expect(unconfirmed.stderr).toContain(`--confirm-db ${TARGET}`);
    expect(await owner`select 1 from public.housing_beneficiaries where serial_no = 40`).toHaveLength(1);
    expect((await storage.get('housing/old.webp')).readable).toBe(true);

    // The target's own record wrote a log row newer than the source's, as staging's data does.
    expect((await runImport(['--replace', '--confirm-db', TARGET])).stderr).toContain('newer than the source');
    const res = await runImport(['--replace', '--confirm-db', TARGET, '--discard-new-writes']);
    expect(res.stderr).toBe('');
    expect(res.code).toBe(0);
    expect(await owner`select 1 from public.housing_beneficiaries where serial_no = 40`).toHaveLength(0);
    expect(await owner`select 1 from public.housing_files`).toHaveLength(0);
    await expect(storage.get('housing/old.webp')).rejects.toThrow();
    expect(await tableText(owner, 'housing_beneficiaries')).toEqual(await tableText(src, 'housing_beneficiaries'));
  });

  it('refuses to wipe writes newer than the source unless --discard-new-writes', async () => {
    await seedSource();
    await importDirect();
    await withActor(app, { id: randomUUID(), email: 'after@example.org' }, (tx) => insertRecord(tx));
    await expect(importDirect({ replace: true })).rejects.toThrow(/newer than the source/);
    await importDirect({ replace: true, discardNewWrites: true });
    expect(await tableText(owner, 'housing_activity_log')).toEqual(await tableText(src, 'housing_activity_log'));
  });

  it('refuses a source whose copied tables have a column the target lacks', async () => {
    await src`alter table public.housing_beneficiaries add column phone text`;
    await expect(importDirect()).rejects.toThrow(/housing_beneficiaries: the target has no phone.*port/s);
  });

  it('refuses a source without auth.users or an admin column', async () => {
    await src`alter table public.housing_admins rename column email to mail`;
    await expect(importDirect()).rejects.toThrow(/housing_admins: the source has no email/);
    await src`drop table public.housing_admins`;
    await src`drop table auth.users`;
    await expect(importDirect()).rejects.toThrow(/no auth\.users/);
  });

  it('refuses a non-local source without --source-ca, and the target as its own source', async () => {
    const remote = await runImport([], 'postgres://reader:secret-pw@db.example.supabase.co:5432/postgres\n');
    expect(remote.code).not.toBe(0);
    expect(remote.stderr).toContain('--source-ca');
    const same = await runImport([], `${testOwnerUrl}\n`);
    expect(same.stderr).toContain('same database');
    for (const out of [remote.stdout, remote.stderr, same.stdout, same.stderr]) {
      expect(out).not.toContain('secret-pw');
      expect(out).not.toContain('housing_owner_local');
    }
  });

  it('refuses an existing report file before reading anything, and leaves no report after a refused run', async () => {
    await seedSource();
    const report = reportPath();
    await writeFile(report, 'an earlier run');
    const existing = await importCli(['import', '--report', report, '--photo-base', NO_PHOTO_BASE], `${testSourceUrl}\n`, nasEnv());
    expect(existing.code).not.toBe(0);
    expect(existing.stderr).toContain('already exists');
    expect(await readFile(report, 'utf8')).toBe('an earlier run');
    expect(await owner`select 1 from public.housing_beneficiaries`).toHaveLength(0);

    await insertRecord(owner);
    const fresh = reportPath();
    const refused = await importCli(['import', '--report', fresh, '--photo-base', NO_PHOTO_BASE], `${testSourceUrl}\n`, nasEnv());
    expect(refused.stderr).toContain('not empty');
    await expect(stat(fresh)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('needs --report and a source URL on stdin', async () => {
    expect((await importCli(['import', '--photo-base', NO_PHOTO_BASE], `${testSourceUrl}\n`, nasEnv())).stderr).toContain('--report');
    expect((await runImport([], '')).stderr).toContain('no supabase database url given on stdin');
  });
});
