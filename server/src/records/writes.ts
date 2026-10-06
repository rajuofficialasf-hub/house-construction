import { withActor, type Actor, type Sql } from '../db.js';
import { ADMIN_RECORD_COLUMNS, type ProjectRecord, type RecordProject } from './reads.js';
import type { BulkCreateBody, BulkUpdateBody, RecordCreateBody, RecordPatchBody } from './schemas.js';

// The single-record writes (docs/api/PROJECTS_API_CONTRACT.md §4.4.4, §4.4.5). Each runs in one
// withActor() transaction so the activity trigger records the session's admin. The record trigger
// (0013_record_rules.sql) checks and normalises every value and raises HC400 with a field key.
// Delete reuses deleteRecord (housing/writes.ts), which also tombstones the record's photos.

/** Inserts a record in a non-group project; with no serial_no the trigger assigns the next one. */
export async function createProjectRecord(sql: Sql, actor: Actor, project: RecordProject, body: RecordCreateBody): Promise<ProjectRecord> {
  return withActor(sql, actor, async (tx) => {
    const row = { ...body, project_type: project.key, extra: tx.json(body.extra as never) };
    const [created] = await tx<ProjectRecord[]>`
      insert into public.housing_beneficiaries ${tx(row)} returning ${tx(ADMIN_RECORD_COLUMNS)}`;
    if (!created) throw new Error('insert returned no row');
    return created;
  });
}

/** Changes only the given fields; a sent extra replaces the whole column. Null when the record doesn't exist. */
export async function patchRecord(sql: Sql, actor: Actor, id: string, patch: RecordPatchBody): Promise<ProjectRecord | null> {
  return withActor(sql, actor, async (tx) => {
    const changes = patch.extra === undefined ? patch : { ...patch, extra: tx.json(patch.extra as never) };
    const [updated] = await tx<ProjectRecord[]>`
      update public.housing_beneficiaries set ${tx(changes)} where id = ${id} returning ${tx(ADMIN_RECORD_COLUMNS)}`;
    return updated ?? null;
  });
}

export interface BulkCreateResult {
  inserted: number;
  /** Always empty: the batch commits whole or not at all (§4.4.7); the field stays for the contract. */
  failed: never[];
}

/**
 * Inserts a batch into a non-group project in one call to housing_bulk_insert_records
 * (0014_record_functions_v2.sql), all or nothing. A refused row comes back as HC400/HC409 with its
 * index in HINT, which errors.ts turns into details.row_index.
 */
export async function bulkInsertRecords(sql: Sql, actor: Actor, project: RecordProject, body: BulkCreateBody): Promise<BulkCreateResult> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<{ inserted: number }[]>`
      select public.housing_bulk_insert_records(
        ${project.key}, ${tx.json(body.rows as never)}, ${body.mode === 'use_given_serial'}) as inserted`;
    if (!row) throw new Error('housing_bulk_insert_records returned no row');
    return { inserted: row.inserted, failed: [] };
  });
}

export interface BulkUpdateResult {
  updated: number;
  missing: number[];
}

/** Updates a batch by serial in one call to housing_bulk_update_by_serial, all or nothing. */
export async function bulkUpdateRecords(sql: Sql, actor: Actor, project: RecordProject, body: BulkUpdateBody): Promise<BulkUpdateResult> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<{ result: BulkUpdateResult }[]>`
      select public.housing_bulk_update_by_serial(${project.key}, ${tx.json(body.rows as never)}) as result`;
    if (!row) throw new Error('housing_bulk_update_by_serial returned no row');
    return row.result;
  });
}

/**
 * Moves a record to another serial through housing_change_serial (0002_serial.sql), which raises
 * the counter, writes the audit row and never reissues the old serial; a taken serial is its 23505,
 * which errors.ts maps to 409. The same serial changes nothing and logs nothing. Null when the
 * record doesn't exist. Photos stay put: their URLs don't depend on the serial.
 */
export async function changeRecordSerial(sql: Sql, actor: Actor, id: string, serialNo: number): Promise<ProjectRecord | null> {
  return withActor(sql, actor, async (tx) => {
    const [current] = await tx<ProjectRecord[]>`
      select ${tx(ADMIN_RECORD_COLUMNS)} from public.housing_beneficiaries where id = ${id} for update`;
    if (!current) return null;
    if (current.serial_no === serialNo) return current;
    const [moved] = await tx<ProjectRecord[]>`
      select ${tx(ADMIN_RECORD_COLUMNS)} from public.housing_change_serial(${id}, ${serialNo})`;
    if (!moved) throw new Error('housing_change_serial returned no row');
    return moved;
  });
}
