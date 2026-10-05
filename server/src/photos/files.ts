import type { Logger } from 'pino';
import type { Sql } from '../db.js';
import type { StorageDriver } from '../storage/index.js';

/** A housing_files row whose object is still to be removed (deleted_at set in a committed transaction). */
export interface TombstonedFile {
  id: string;
  storage_key: string;
}

/**
 * Removes tombstoned files from storage, then their rows. Runs only after the transaction that
 * tombstoned them has committed, never inside it (DB-TX-02). A failure is logged and the row stays
 * a tombstone for `npm run files:sweep`; storage.remove succeeds on a missing key, so a retry is safe.
 * Resolves with the number removed.
 */
export async function removeTombstoned(sql: Sql, storage: StorageDriver, files: readonly TombstonedFile[], log: Logger): Promise<number> {
  const results = await Promise.allSettled(files.map((file) => storage.remove(file.storage_key)));
  const removed: string[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled') removed.push(files[i]!.id);
    else log.warn({ err: result.reason, fileId: files[i]!.id }, 'could not remove a replaced photo file; files:sweep will retry');
  });
  if (removed.length > 0) {
    // If this fails the rows stay tombstoned; their objects are already gone, and a retry's remove is a no-op.
    await sql`delete from public.housing_files where id in ${sql(removed)} and deleted_at is not null`.catch((err: unknown) => {
      log.warn({ err, fileIds: removed }, 'could not delete removed photo file rows; files:sweep will retry');
      removed.length = 0;
    });
  }
  return removed.length;
}
