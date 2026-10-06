// One-time copy of the housing data from Supabase into this server's database, and the check that
// the copy is exact (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md; steps for a person in
// docs/operations/runbook.md section 19). Supabase is only read. The target is written as the schema
// owner (DATABASE_MIGRATION_URL), in one transaction. The Supabase connection string is read from
// a prompt (or one line of piped stdin), never from arguments or the environment.
//
//   import-supabase import --report <file> --photo-base <bucket URL> [--source-ca <file>]
//       [--replace --confirm-db <target database>] [--discard-new-writes] [--without-passwords]
//   import-supabase verify [--report <file>] [--source-ca <file>] [--photos [--photos-via <origin>]]
import { accessSync, constants } from 'node:fs';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { z } from 'zod';
import { baseUrl, storageSchema } from '../config.js';
import type { Sql } from '../db.js';
import { mapAdmins } from '../import/admins.js';
import { readReport, writeReport, type ImportReport } from '../import/report.js';
import { checkSource, describeDatabase, openSource, readSnapshot } from '../import/source.js';
import { copyPhotos, parsePhotoBase, removeAll } from '../import/photos.js';
import { checkTarget, writeImport, type TargetOptions } from '../import/target.js';
import { verifyImport, type Check } from '../import/verify.js';
import { createStorage } from '../storage/index.js';
import { CliError, readSecret } from './prompt.js';

const USAGE = `usage:
  import-supabase import --report <file> --photo-base <bucket URL> [--source-ca <file>]
      [--replace --confirm-db <target database>] [--discard-new-writes] [--without-passwords]
  import-supabase verify [--report <file>] [--source-ca <file>] [--photos [--photos-via <origin>]]`;

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });
const verifyEnv = z.object({ DATABASE_MIGRATION_URL: postgresUrl, PUBLIC_API_URL: baseUrl });
const importEnv = verifyEnv.and(storageSchema);

function parseEnv<T>(schema: z.ZodType<T>): T {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    // Names only: a value may be a credential.
    const names = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new CliError(`missing or invalid settings: ${names}`);
  }
  return result.data;
}

function describeStorage(env: z.infer<typeof storageSchema>): string {
  if (env.STORAGE_DRIVER === 'nas') return `nas ${env.STORAGE_ROOT}`;
  // TEMP: S3 until the NAS is ready (NS-35). The key id shows which identity writes; never the secret.
  return `s3 ${env.S3_BUCKET} (access key ${process.env.AWS_ACCESS_KEY_ID ?? 'from the host role'})`;
}

async function readSourceUrl(target: string): Promise<string> {
  const url = postgresUrl.safeParse((await readSecret('Supabase database URL')).trim());
  if (!url.success) throw new CliError('that is not a postgres:// URL');
  if (describeDatabase(url.data) === describeDatabase(target)) throw new CliError('the source and the target are the same database');
  return url.data;
}

async function runImport(values: Values): Promise<void> {
  if (!values.report) throw new CliError(`--report <file> is required\n${USAGE}`);
  if (!values['photo-base']) throw new CliError(`--photo-base <bucket URL> is required\n${USAGE}`);
  const photoBase = parsePhotoBase(values['photo-base']);
  const env = parseEnv(importEnv);
  const targetName = new URL(env.DATABASE_MIGRATION_URL).pathname.slice(1);
  if (values.replace && values['confirm-db'] !== targetName) {
    throw new CliError(`--replace wipes the target; confirm it with --confirm-db ${targetName}`);
  }
  if (values['source-ca']) accessSync(values['source-ca'], constants.R_OK);
  console.log(`target: ${describeDatabase(env.DATABASE_MIGRATION_URL)}`);
  console.log(`photos: ${describeStorage(env)}, URLs under ${env.PUBLIC_API_URL}`);

  const sourceUrl = await readSourceUrl(env.DATABASE_MIGRATION_URL);
  const source = openSource(sourceUrl, values['source-ca']);
  const target = postgres(env.DATABASE_MIGRATION_URL, { max: 1, onnotice: () => {} });
  const storage = createStorage(env);
  try {
    await checkSource(source, target);
    const snapshot = await readSnapshot(source);
    console.log(`source: ${describeDatabase(sourceUrl)} (time zone ${snapshot.timeZone})`);
    const options: TargetOptions = {
      replace: values.replace ?? false,
      discardNewWrites: values['discard-new-writes'] ?? false,
      sourceActivityMaxAt: snapshot.activityMaxAt,
    };
    await checkTarget(target, options);

    const { admins, disabled } = mapAdmins(snapshot.users, { withoutPasswords: values['without-passwords'] ?? false, now: new Date() });
    const photos = await copyPhotos(snapshot.records, { storage, publicApiUrl: env.PUBLIC_API_URL, photoBase });
    let wipedKeys: string[];
    try {
      ({ wipedKeys } = await writeImport(target, { snapshot, admins, photos: photos.result }, options));
    } catch (err) {
      await removeAll(storage, photos.writtenKeys);
      throw err;
    }
    await removeAll(storage, wipedKeys);

    const report: ImportReport = {
      created_at: new Date().toISOString(),
      source: describeDatabase(sourceUrl),
      target: describeDatabase(env.DATABASE_MIGRATION_URL),
      photo_gaps: photos.gaps,
      generated_thumbs: photos.generated,
      admins_disabled: disabled,
    };
    await writeReport(values.report, report);
    await printSummary(target, report);
    console.log(`report: ${values.report}`);
    printChecks(await verifyImport(source, target, report));
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

async function printSummary(target: Sql, report: ImportReport): Promise<void> {
  const rows = await target<{ what: string; n: number }[]>`
    select 'records ' || project_type as what, count(*)::int as n from public.housing_beneficiaries group by project_type
    union all select 'counter ' || project_type, last_serial from public.housing_serial_counters
    union all select 'serial changes', count(*)::int from public.housing_serial_changes
    union all select 'activity rows', count(*)::int from public.housing_activity_log
    union all select 'admins', count(*)::int from public.housing_admins
    union all select 'photo files', count(*)::int from public.housing_files
    order by 1`;
  for (const row of rows) console.log(`${row.what.padEnd(24)} ${row.n}`);
  console.log(`admins imported disabled ${report.admins_disabled.length}`);
  console.log(`photo gaps               ${report.photo_gaps.length}`);
  console.log(`generated thumbs         ${report.generated_thumbs.length}`);
}

/** Prints every check; a failed one sets the exit code, so a script can't miss it. */
function printChecks(checks: Check[]): void {
  console.log('\nverify:');
  for (const check of checks) console.log(`${check.ok ? 'ok  ' : 'FAIL'}  ${check.name.padEnd(48)} ${check.detail}`);
  const failed = checks.filter((c) => !c.ok).length;
  if (failed > 0) {
    console.error(`verify: ${failed} check(s) failed`);
    process.exitCode = 1;
  }
}

async function runVerify(values: Values): Promise<void> {
  const env = parseEnv(verifyEnv);
  if (values['photos-via'] && !values.photos) throw new CliError('--photos-via needs --photos');
  const via = values['photos-via'];
  if (via && !(URL.canParse(via) && new URL(via).origin === via)) throw new CliError('--photos-via must be an origin like http://127.0.0.1:3201');
  if (values['source-ca']) accessSync(values['source-ca'], constants.R_OK);
  const report = values.report ? await readReport(values.report) : undefined;
  const sourceUrl = await readSourceUrl(env.DATABASE_MIGRATION_URL);
  const source = openSource(sourceUrl, values['source-ca']);
  const target = postgres(env.DATABASE_MIGRATION_URL, { max: 1, onnotice: () => {} });
  try {
    console.log(`source: ${describeDatabase(sourceUrl)}; target: ${describeDatabase(env.DATABASE_MIGRATION_URL)}`);
    printChecks(await verifyImport(source, target, report, values.photos ? { via, publicApiUrl: env.PUBLIC_API_URL } : undefined));
  } finally {
    await Promise.all([source.end(), target.end()]);
  }
}

const OPTIONS = {
  report: { type: 'string' },
  'photo-base': { type: 'string' },
  'source-ca': { type: 'string' },
  replace: { type: 'boolean' },
  'confirm-db': { type: 'string' },
  'discard-new-writes': { type: 'boolean' },
  'without-passwords': { type: 'boolean' },
  photos: { type: 'boolean' },
  'photos-via': { type: 'string' },
} as const;
type Values = ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>['values'];

async function run(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  const [command, ...extra] = positionals;
  if (extra.length > 0) throw new CliError(USAGE);
  if (command === 'import') return runImport(values);
  if (command === 'verify') return runVerify(values);
  throw new CliError(USAGE);
}

run(process.argv.slice(2)).catch((err: unknown) => {
  // CliError and argument errors are meant for the operator. Anything else (a database or network
  // error) is shown by message only: never a stack, a connection string or a row's values.
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
