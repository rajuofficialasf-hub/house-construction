import { withActor, type Actor, type Sql } from '../db.js';
import { AppError } from '../errors.js';
import { RECORD_COLUMNS, type HousingRecord } from './reads.js';
import type { BulkInsertBody, BulkUpdateBody, CreateBody, UpdateBody } from './schemas.js';

// The housing writes (docs/api/API_CONTRACT.md §4.5খ–§4.9খ). Each runs in one withActor()
// transaction, so the activity trigger records the admin from the session; nothing here reads an
// actor from input. The triggers in 0002_serial.sql assign serials, keep the counters and refuse
// a direct serial_no or project_type change.

/** Inserts one record; with no serial_no the trigger assigns the next one. */
export async function createRecord(sql: Sql, actor: Actor, body: CreateBody): Promise<HousingRecord> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<HousingRecord[]>`
      insert into public.housing_beneficiaries ${tx(body)} returning ${tx(RECORD_COLUMNS)}`;
    if (!row) throw new Error('insert returned no row');
    return row;
  });
}

/** Changes only the given fields. Null when the record doesn't exist. */
export async function updateRecord(sql: Sql, actor: Actor, id: string, patch: UpdateBody): Promise<HousingRecord | null> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<HousingRecord[]>`
      update public.housing_beneficiaries set ${tx(patch)} where id = ${id} returning ${tx(RECORD_COLUMNS)}`;
    return row ?? null;
  });
}

/** False when the record doesn't exist. Its serial stays used: the counter never goes down. */
export async function deleteRecord(sql: Sql, actor: Actor, id: string): Promise<boolean> {
  return withActor(sql, actor, async (tx) => {
    const rows = await tx`delete from public.housing_beneficiaries where id = ${id} returning id`;
    return rows.length > 0;
  });
}

/**
 * Moves a record to another serial through housing_change_serial, which locks the row, raises the
 * counter and writes the audit row. It raises P0002 for an unknown id and 23505 for a taken serial;
 * the error handler maps both. Photo URLs are left as they are: the files stay at the old
 * serial's path, which is never reused, until the photo routes move them.
 */
export async function changeSerial(sql: Sql, actor: Actor, id: string, serialNo: number): Promise<HousingRecord> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<HousingRecord[]>`
      select ${tx(RECORD_COLUMNS)} from public.housing_change_serial(${id}, ${serialNo})`;
    if (!row) throw new Error('housing_change_serial returned no row');
    return row;
  });
}

// Every row lists every column, so one multi-row VALUES covers the batch.
const BULK_COLUMNS: (keyof CreateBody)[] = [
  'project_type', 'year', 'name', 'father_or_husband_name', 'division', 'district', 'upazila', 'address',
  'prev_photo_source', 'current_photo_source',
];

/**
 * Inserts every row in one statement and one transaction: all or nothing. With assign_serial the
 * trigger numbers the rows in order; with use_given_serial a serial already in use is refused
 * first, naming its row (a concurrent insert still hits the unique key, which maps to 409).
 */
export async function bulkInsert(sql: Sql, actor: Actor, body: BulkInsertBody): Promise<{ inserted: number; failed: [] }> {
  const rows: CreateBody[] = body.rows.map((row) => ({ ...row, project_type: body.project_type }));
  const givenSerials = body.mode === 'use_given_serial';
  return withActor(sql, actor, async (tx) => {
    if (givenSerials) {
      // The schema guarantees a serial on every row in this mode.
      const serials = rows.map((row) => row.serial_no as number);
      const [taken] = await tx<{ serial_no: number }[]>`
        select serial_no from public.housing_beneficiaries
        where project_type = ${body.project_type} and serial_no = any(${serials}::int[])
        order by serial_no limit 1`;
      if (taken) {
        throw new AppError('CONFLICT', `serial_no ${taken.serial_no} আগে থেকেই আছে`, {
          row_index: serials.indexOf(taken.serial_no),
          field: 'serial_no',
          reason: 'duplicate',
        });
      }
    }
    const columns = givenSerials ? [...BULK_COLUMNS, 'serial_no' as const] : BULK_COLUMNS;
    const result = await tx`insert into public.housing_beneficiaries ${tx(rows, columns)}`;
    return { inserted: result.count, failed: [] };
  });
}

/** Updates rows by serial through housing_bulk_update_by_serial; unknown serials come back in missing. */
export async function bulkUpdateBySerial(sql: Sql, actor: Actor, body: BulkUpdateBody): Promise<{ updated: number; missing: number[] }> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<{ result: { updated: number; missing: number[] } }[]>`
      select public.housing_bulk_update_by_serial(${body.project_type}, ${tx.json(body.rows as never)}) as result`;
    if (!row) throw new Error('housing_bulk_update_by_serial returned no row');
    return row.result;
  });
}
