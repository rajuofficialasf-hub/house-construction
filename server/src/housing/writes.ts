import type { Logger } from 'pino';
import { withActor, type Actor, type Sql } from '../db.js';
import { removeTombstoned, type TombstonedFile } from '../photos/files.js';
import type { StorageDriver } from '../storage/index.js';

// The record delete behind DELETE /api/v1/records/:id (src/routes/v1/records-admin.ts). It runs in
// one withActor() transaction, so the activity trigger records the admin from the session; nothing
// here reads an actor from input.

/**
 * False when the record doesn't exist. Its serial stays used: the counter never goes down. Its
 * photo files are tombstoned in the same transaction and removed from storage after it commits
 * (DB-TX-02); a removal that fails is left for files:sweep and doesn't fail the delete.
 */
export async function deleteRecord(sql: Sql, storage: StorageDriver, actor: Actor, id: string, log: Logger): Promise<boolean> {
  let files: TombstonedFile[] = [];
  const deleted = await withActor(sql, actor, async (tx) => {
    // The same row lock as the photo writes, so an upload in flight either commits first (and its
    // files are tombstoned here) or waits and then finds no record.
    const locked = await tx`select id from public.housing_beneficiaries where id = ${id} for update`;
    if (locked.length === 0) return false;
    files = await tx<TombstonedFile[]>`
      update public.housing_files set deleted_at = now()
      where record_id = ${id} and deleted_at is null
      returning id, storage_key`;
    const rows = await tx`delete from public.housing_beneficiaries where id = ${id} returning id`;
    return rows.length > 0;
  });
  await removeTombstoned(sql, storage, files, log);
  return deleted;
}
