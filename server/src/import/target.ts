// Writing the import into the new database in one transaction, as the schema owner
// (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md). Either everything arrives or nothing does.
// The activity-log trigger is switched off for the transaction, so loading records doesn't add a
// fake "create" row for each; ALTER TABLE is transactional, so a failed import leaves it on.
// The serial trigger stays on: it keeps each explicit serial and raises the counter to it, and
// the counters are then set to the source's exact values.
import type { Sql, Tx } from '../db.js';
import { CliError } from '../cli/prompt.js';
import type { TargetAdmin } from './admins.js';
import { URL_COLUMNS, type Snapshot, type UrlColumn } from './source.js';

// Every table that holds imported data or points at it. The truncate names them all instead of
// cascading, so a table added later that references them stops the wipe instead of being emptied.
const WIPED_TABLES = [
  'housing_beneficiaries',
  'housing_files',
  'housing_serial_changes',
  'housing_activity_log',
  'housing_admins',
  'housing_admin_sessions',
] as const;

/** A housing_files row for a copied photo, written in the same transaction as its record. */
export interface ImportedFile {
  id: string;
  record_id: string;
  kind: 'prev' | 'current';
  variant: 'photo' | 'thumb';
  storage_key: string;
  storage_driver: string;
  content_type: string;
  size_bytes: number;
  original_name: string;
}

/** What the photo copy produced: each record's new URLs, and the file rows behind them. */
export interface PhotoResult {
  urls: Map<string, Partial<Record<UrlColumn, string>>>;
  files: ImportedFile[];
}

export const NO_PHOTOS: PhotoResult = { urls: new Map(), files: [] };

export interface TargetOptions {
  /** Wipe a non-empty target first. */
  replace: boolean;
  /** Also wipe a target whose activity log is newer than the source's (writes made after a cutover). */
  discardNewWrites: boolean;
  /** The source's newest activity time; null when its log is empty. */
  sourceActivityMaxAt: string | null;
}

interface TargetState {
  rows: Record<(typeof WIPED_TABLES)[number], number>;
  counters: number;
  activityMaxAt: string | null;
}

async function targetState(sql: Sql | Tx): Promise<TargetState> {
  const [row] = await sql<{ [k: string]: number | string | null }[]>`
    select
      (select count(*)::int from public.housing_beneficiaries) as housing_beneficiaries,
      (select count(*)::int from public.housing_files) as housing_files,
      (select count(*)::int from public.housing_serial_changes) as housing_serial_changes,
      (select count(*)::int from public.housing_activity_log) as housing_activity_log,
      (select count(*)::int from public.housing_admins) as housing_admins,
      (select count(*)::int from public.housing_admin_sessions) as housing_admin_sessions,
      (select coalesce(sum(last_serial), 0)::int from public.housing_serial_counters) as counters,
      (select max(at)::text from public.housing_activity_log) as activity_max_at`;
  const rows = Object.fromEntries(WIPED_TABLES.map((t) => [t, Number(row![t])])) as TargetState['rows'];
  return { rows, counters: Number(row!.counters), activityMaxAt: row!.activity_max_at as string | null };
}

const isEmpty = (state: TargetState) => state.counters === 0 && Object.values(state.rows).every((n) => n === 0);

/**
 * Refuses a target the options don't allow: a non-empty one without `replace`, or one holding
 * writes newer than the source without `discardNewWrites`. Runs once before any photo is copied,
 * and again inside the import transaction.
 */
export async function checkTarget(sql: Sql | Tx, options: TargetOptions): Promise<{ empty: boolean }> {
  for (const table of [...WIPED_TABLES, 'housing_serial_counters']) {
    const [row] = await sql<{ found: string | null }[]>`select to_regclass(${`public.${table}`})::text as found`;
    if (!row?.found) throw new CliError(`the target has no public.${table}; run the migrations first`);
  }
  const state = await targetState(sql);
  if (isEmpty(state)) return { empty: true };
  if (!options.replace) {
    const filled = Object.entries(state.rows).filter(([, n]) => n > 0).map(([t, n]) => `${t} (${n})`);
    if (state.counters > 0) filled.push('housing_serial_counters (not zero)');
    throw new CliError(`the target is not empty: ${filled.join(', ')}; use --replace --confirm-db <name> to wipe it`);
  }
  const newer =
    state.activityMaxAt !== null && (options.sourceActivityMaxAt === null || Date.parse(state.activityMaxAt) > Date.parse(options.sourceActivityMaxAt));
  if (newer && !options.discardNewWrites) {
    throw new CliError(
      'the target has activity newer than the source (writes made on the new stack); add --discard-new-writes only after those writes were re-entered on Supabase',
    );
  }
  return { empty: false };
}

/** Wipes the target's data inside the transaction and returns every storage key its file rows held. */
async function wipe(tx: Tx): Promise<string[]> {
  const keys = await tx<{ storage_key: string }[]>`select storage_key from public.housing_files`;
  await tx`truncate ${tx(WIPED_TABLES.map((t) => `public.${t}`))} restart identity`;
  await tx`update public.housing_serial_counters set last_serial = 0`;
  return keys.map((k) => k.storage_key);
}

const populate = (tx: Tx, table: string, json: string) =>
  tx`insert into ${tx(`public.${table}`)}
     select * from jsonb_populate_recordset(null::${tx(`public.${table}`)}, ${json}::text::jsonb)`;

const setSequence = (tx: Tx, table: string) =>
  tx`select setval(pg_get_serial_sequence(${`public.${table}`}, 'id'), max(id)) from ${tx(`public.${table}`)} having count(*) > 0`;

export interface ImportInput {
  snapshot: Snapshot;
  admins: TargetAdmin[];
  photos: PhotoResult;
}

/**
 * Loads the snapshot into the target in one transaction. Returns the storage keys of any files
 * wiped by `replace`; the caller removes them from storage after this commits (DB-TX-02).
 */
export async function writeImport(owner: Sql, input: ImportInput, options: TargetOptions): Promise<{ wipedKeys: string[] }> {
  const { snapshot, admins, photos } = input;
  return (await owner.begin(async (tx) => {
    await tx`set local statement_timeout = 0`;
    // A running API holding these tables makes the import fail fast instead of queueing every reader behind it.
    await tx`set local lock_timeout = '10s'`;
    await tx`lock table ${tx(WIPED_TABLES.map((t) => `public.${t}`))}, public.housing_serial_counters in access exclusive mode`;
    const { empty } = await checkTarget(tx, options);
    const wipedKeys = empty ? [] : await wipe(tx);

    await tx`alter table public.housing_beneficiaries disable trigger housing_beneficiaries_activity_log`;

    // Every record's photo URLs come from the copy: a slot it couldn't fill stays empty.
    const records = snapshot.records.map((r) => ({
      ...r,
      ...Object.fromEntries(URL_COLUMNS.map((column) => [column, photos.urls.get(r.id)?.[column] ?? null])),
    }));
    const now = new Date().toISOString();
    await populate(tx, 'housing_beneficiaries', JSON.stringify(records));
    await populate(tx, 'housing_files', JSON.stringify(photos.files.map((f) => ({ ...f, created_by: null, created_at: now, deleted_at: null }))));
    await populate(tx, 'housing_serial_changes', snapshot.serialChangesJson);
    await populate(tx, 'housing_activity_log', snapshot.activityJson);
    await setSequence(tx, 'housing_serial_changes');
    await setSequence(tx, 'housing_activity_log');
    await populate(tx, 'housing_admins', JSON.stringify(admins));

    for (const { project_type, last_serial } of snapshot.counters) {
      const [current] = await tx<{ last_serial: number }[]>`
        select last_serial from public.housing_serial_counters where project_type = ${project_type}`;
      if (!current) throw new CliError(`the target has no serial counter for ${project_type}`);
      if (current.last_serial > last_serial) {
        throw new CliError(`a ${project_type} serial in the source is above its own counter (${last_serial}); fix the source first`);
      }
      await tx`update public.housing_serial_counters set last_serial = ${last_serial} where project_type = ${project_type}`;
    }
    const above = await tx<{ project_type: string }[]>`
      select b.project_type from public.housing_beneficiaries b
      join public.housing_serial_counters c using (project_type)
      group by b.project_type, c.last_serial having max(b.serial_no) > c.last_serial`;
    if (above.length > 0) throw new CliError(`serials above their counter after the import: ${above.map((r) => r.project_type).join(', ')}`);

    await tx`alter table public.housing_beneficiaries enable trigger housing_beneficiaries_activity_log`;
    return { wipedKeys };
  })) as { wipedKeys: string[] };
}
