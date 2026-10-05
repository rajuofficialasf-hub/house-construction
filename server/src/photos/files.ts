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
  const results = await Promise.allSettled(
    files.map(async (file) => {
      await storage.remove(file.storage_key);
      await sql`delete from public.housing_files where id = ${file.id} and deleted_at is not null`;
    }),
  );
  results.forEach((result, i) => {
    if (result.status === 'rejected') {
      log.warn({ err: result.reason, fileId: files[i]!.id }, 'could not remove a replaced photo file; files:sweep will retry');
    }
  });
  return results.filter((result) => result.status === 'fulfilled').length;
}
