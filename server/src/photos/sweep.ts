import type { Logger } from 'pino';
import type { Sql } from '../db.js';
import type { StorageDriver } from '../storage/index.js';
import { removeTombstoned, type TombstonedFile } from './files.js';

export interface SweepResult {
  removed: number;
  failed: number;
}

/**
 * Finishes photo removals that failed after their transaction committed: each tombstoned file is
 * removed from storage, then its row. Oldest first, at most `limit` per run, so a storage outage
 * can't turn one run into an endless loop; a failure keeps the row for the next run.
 */
export async function sweepTombstones(sql: Sql, storage: StorageDriver, log: Logger, limit = 500): Promise<SweepResult> {
  const files = await sql<TombstonedFile[]>`
    select id, storage_key from public.housing_files
    where deleted_at is not null order by deleted_at, id limit ${limit}`;
  const removed = await removeTombstoned(sql, storage, files, log);
  return { removed, failed: files.length - removed };
}
