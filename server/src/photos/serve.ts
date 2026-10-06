import type { Sql } from '../db.js';
import type { Viewer } from '../projects/reads.js';

export interface LiveFile {
  storage_key: string;
  content_type: string;
  /** int8 comes back from postgres.js as a string. */
  size_bytes: string;
}

/**
 * The file behind GET /api/v1/photos/:id, but only while a record uses it: a replaced (tombstoned)
 * or detached file is not served. A visitor gets only files of records in a public project, so a
 * draft's photos stay hidden like its records (NE-SEC-03); an admin session gets any live file.
 * Project covers join here too once they are stored as files.
 */
export async function findLiveFile(sql: Sql, id: string, viewer: Viewer): Promise<LiveFile | null> {
  const [row] = await sql<LiveFile[]>`
    select f.storage_key, f.content_type, f.size_bytes
    from public.housing_files f join public.housing_beneficiaries b on b.id = f.record_id
    where f.id = ${id} and f.deleted_at is null
      and (${viewer.admin} or b.project_type = any(public.housing_public_project_keys()))`;
  return row ?? null;
}
