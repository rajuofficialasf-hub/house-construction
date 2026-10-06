import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hashPassword } from '../../src/auth/password.js';
import { createApp } from '../../src/app.js';
import { mapAdmins } from '../../src/import/admins.js';
import { copyPhotos, parsePhotoBase } from '../../src/import/photos.js';
import { writeReport, type ImportReport } from '../../src/import/report.js';
import { checkSource, openSource, readSnapshot } from '../../src/import/source.js';
import { writeImport } from '../../src/import/target.js';
import { verifyImport, type Check } from '../../src/import/verify.js';
import { createLogger } from '../../src/logger.js';
import { createNasDriver } from '../../src/storage/drivers/nas.js';
import type { StorageDriver } from '../../src/storage/index.js';
import type { Sql } from '../../src/db.js';
import { appDb, ownerDb, resetTestData } from '../support/db.js';
import { importCli } from '../support/import-cli.js';
import { insertSourceRecord, insertSourceUser, resetSource, setSourceCounter, sourceDb, testSourceUrl } from '../support/source.js';

// import-supabase verify (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md; R16 of
// docs/plans/2026-10-05-1147-migrate-supabase-to-org-stack-plan.md): after a real
// import every check passes, and each kind of drift fails the check that names it, by id only.

const BUCKET = '/storage/v1/object/public/housing-photos/';
const NAME = 'গোপন নাম';
const app = appDb();
const owner = ownerDb();
const src = sourceDb();
let bucket: Server;
let api: Server;
let base = '';
let apiOrigin = '';
let webp: Buffer;
let work = '';
let storage: StorageDriver;
let publicApiUrl = '';

beforeAll(async () => {
  webp = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#259' } }).webp().toBuffer();
  bucket = createServer((req, res) => {
    if ((req.url ?? '').includes('/missing')) res.writeHead(404).end();
    else res.writeHead(200, { 'content-type': 'image/webp' }).end(webp);
  });
  bucket.listen(0, '127.0.0.1');
  await once(bucket, 'listening');
  base = `http://127.0.0.1:${(bucket.address() as AddressInfo).port}${BUCKET}`;
});

beforeEach(async () => {
  await Promise.all([resetTestData(owner), resetSource(src)]);
  work = await mkdtemp(path.join(os.tmpdir(), 'housing-verify-test-'));
  storage = createNasDriver({ STORAGE_ROOT: path.join(work, 'storage') });
  api = createApp({
    sql: app,
    logger: createLogger('silent'),
    trustProxy: 0,
    allowedOrigins: [],
    publicReadOrigins: [],
    cookieSecure: false,
    storage,
    publicApiUrl: 'https://housing.example.org',
  }).listen(0, '127.0.0.1');
  await once(api, 'listening');
  apiOrigin = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
  // Photo URLs are stored with the public origin; the checks reach the API through --photos-via.
  publicApiUrl = 'https://housing.example.org';
});
afterEach(async () => {
  api.close();
  await rm(work, { recursive: true, force: true });
});
afterAll(async () => {
  bucket.close();
  await Promise.all([app.end(), owner.end(), src.end()]);
});

/** Seeds the source, imports it with its photos, and returns the import's report. */
async function imported(): Promise<ImportReport> {
  const first = await insertSourceRecord(src, {
    serial_no: 1,
    name: NAME,
    prev_photo_url: `${base}housing/semi_pucca/0001/prev.webp`,
    current_photo_url: `${base}housing/semi_pucca/0001/missing.webp`,
  });
  await insertSourceRecord(src, { serial_no: 3, prev_photo_url: `${base}housing/semi_pucca/0003/prev.webp`, prev_thumb_url: `${base}housing/semi_pucca/0003/prev_thumb.webp` });
  await insertSourceRecord(src, { project_type: 'tin', serial_no: 1 });
  await setSourceCounter(src, 'semi_pucca', 4);
  await setSourceCounter(src, 'tin', 1);
  const admin = await insertSourceUser(src, { email: 'admin@example.org', password: 'a long enough password' });
  await src`insert into public.housing_serial_changes (record_id, project_type, old_serial, new_serial, changed_by) values (${first}, 'semi_pucca', 2, 1, ${admin})`;
  await src`insert into public.housing_activity_log (actor_id, actor_email, action, record_id, details) values (${admin}, 'admin@example.org', 'update', ${first}, '{"a": 1.50}')`;

  const source = openSource(testSourceUrl, undefined);
  try {
    await checkSource(source, owner);
    const snapshot = await readSnapshot(source);
    const photos = await copyPhotos(snapshot.records, { storage, publicApiUrl, photoBase: parsePhotoBase(base) });
    const { admins, disabled } = mapAdmins(snapshot.users, { withoutPasswords: false, now: new Date() });
    await writeImport(owner, { snapshot, admins, photos: photos.result }, { replace: false, discardNewWrites: false, sourceActivityMaxAt: snapshot.activityMaxAt });
    return { created_at: '', source: '', target: '', photo_gaps: photos.gaps, generated_thumbs: photos.generated, admins_disabled: disabled };
  } finally {
    await source.end();
  }
}

async function run(report: ImportReport | undefined, withPhotos = false): Promise<Check[]> {
  const source = openSource(testSourceUrl, undefined);
  try {
    return await verifyImport(source, owner as Sql, report, withPhotos ? { via: apiOrigin, publicApiUrl } : undefined);
  } finally {
    await source.end();
  }
}
const failed = (checks: Check[]) => checks.filter((c) => !c.ok).map((c) => c.name);

describe('verifyImport', () => {
  it('passes every check after an import, photos included', async () => {
    const report = await imported();
    expect(report.photo_gaps).toHaveLength(1);
    expect(report.generated_thumbs).toHaveLength(1);
    const checks = await run(report, true);
    expect(failed(checks)).toEqual([]);
    expect(checks.map((c) => c.name)).toContain('photo URLs answer 200');
    expect(checks.find((c) => c.name.startsWith('photo slots'))?.detail).not.toContain('skipped');
  });

  it('skips only the photo count without a report', async () => {
    await imported();
    const checks = await run(undefined);
    expect(failed(checks)).toEqual([]);
    expect(checks.find((c) => c.name === 'photo slots')?.detail).toContain('skipped');
  });

  it.each<[string, (ctx: { report: ImportReport }) => Promise<unknown>, string[]]>([
    [
      'a changed record field',
      // Without the log trigger, so only the record differs.
      () =>
        owner.begin(async (tx) => {
          await tx`alter table public.housing_beneficiaries disable trigger housing_beneficiaries_activity_log`;
          await tx`update public.housing_beneficiaries set address = 'অন্য' where serial_no = 3`;
          await tx`alter table public.housing_beneficiaries enable trigger housing_beneficiaries_activity_log`;
        }),
      ['records'],
    ],
    [
      'an extra log row',
      () => owner`insert into public.housing_activity_log (action) values ('login')`,
      ['activity log max id', 'activity log per action', 'activity log'],
    ],
    ['a changed counter', () => owner`update public.housing_serial_counters set last_serial = 9 where project_type = 'tin'`, ['serial counters']],
    [
      'a serial above its counter',
      () => owner`update public.housing_serial_counters set last_serial = 0 where project_type = 'semi_pucca'`,
      ['serial counters', 'serials at or below their counter'],
    ],
    ['a changed admin hash', () => owner`update public.housing_admins set password_hash = '$2b$04$abcdefghijklmnopqrstuuJ8z9Qd1Oa3H1d0dYyQ0cX8Wn3B5E8Iu'`, ['admin password hashes']],
    [
      'a photo URL without a live file',
      () => owner`update public.housing_files set deleted_at = now() where variant = 'thumb'`,
      ['photo URLs have a live file', 'live files = photo URLs'],
    ],
    ['a source write after the import', () => src`insert into public.housing_activity_log (action) values ('logout')`, ['activity log max id', 'activity log per action', 'activity log']],
    [
      'a missing record',
      () =>
        owner.begin(async (tx) => {
          await tx`alter table public.housing_beneficiaries disable trigger housing_beneficiaries_activity_log`;
          await tx`delete from public.housing_beneficiaries where project_type = 'tin'`;
          await tx`alter table public.housing_beneficiaries enable trigger housing_beneficiaries_activity_log`;
        }),
      ['records per project', 'records'],
    ],
    ['a missing admin', () => owner`delete from public.housing_admins`, ['admins']],
    ['a changed admin email', () => owner`update public.housing_admins set email = 'someone-else@example.org'`, ['admin emails']],
    [
      'a report that hides a photo gap',
      async ({ report }) => {
        report.photo_gaps = [];
      },
      ['photo slots (source + generated = target + gaps)'],
    ],
  ])('fails on %s, naming ids and never values', async (_what, drift, expected) => {
    const report = await imported();
    await drift({ report });
    const checks = await run(report);
    expect(failed(checks)).toEqual(expected);
    expect(JSON.stringify(checks)).not.toMatch(new RegExp(`${NAME}|অন্য|someone-else|\\$2b\\$`));
  });

  it('accepts an admin hash replaced by a login, and fails on a stored photo that is gone', async () => {
    const report = await imported();
    await owner`update public.housing_admins set password_hash = ${await hashPassword('a long enough password')}`;
    const [file] = await owner<{ storage_key: string }[]>`select storage_key from public.housing_files limit 1`;
    await storage.remove(file!.storage_key);
    const checks = await run(report, true);
    expect(failed(checks)).toEqual(['photo URLs answer 200']);
  });

  it('runs from the CLI and exits 1 on a difference', async () => {
    const report = await imported();
    const reportFile = path.join(work, 'report.json');
    await writeReport(reportFile, report);
    const env = { PUBLIC_API_URL: publicApiUrl, STORAGE_ROOT: path.join(work, 'storage') };
    const ok = await importCli(['verify', '--report', reportFile, '--photos', '--photos-via', apiOrigin], `${testSourceUrl}\n`, env);
    expect(ok.stderr).toBe('');
    expect(ok.code).toBe(0);
    expect(ok.stdout).not.toContain('FAIL');
    await owner`delete from public.housing_serial_changes`;
    const bad = await importCli(['verify', '--report', reportFile], `${testSourceUrl}\n`, env);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toMatch(/FAIL\s+serial changes/);
    expect((await importCli(['verify', '--photos-via', apiOrigin], `${testSourceUrl}\n`, env)).stderr).toContain('--photos-via needs --photos');
  });
});
