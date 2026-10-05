import type { Sql } from '../db.js';

export interface LiveFile {
  storage_key: string;
  content_type: string;
  /** int8 comes back from postgres.js as a string. */
  size_bytes: string;
}

/**
 * The file behind GET /api/v1/photos/:id, but only while a record uses it: a replaced (tombstoned)
 * or detached file is not served. Records are all public (contract §1), so a live file is too
 * (NE-SEC-03). If records ever gain a hidden state, this lookup must join the record and apply it.
 */
export async function findLiveFile(sql: Sql, id: string): Promise<LiveFile | null> {
  const [row] = await sql<LiveFile[]>`
    select storage_key, content_type, size_bytes from public.housing_files
    where id = ${id} and deleted_at is null and record_id is not null`;
  return row ?? null;
}
