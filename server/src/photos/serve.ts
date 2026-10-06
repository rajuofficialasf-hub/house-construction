import type { Sql } from '../db.js';
import type { Viewer } from '../projects/reads.js';

export interface LiveFile {
  storage_key: string;
  content_type: string;
  /** int8 comes back from postgres.js as a string. */
  size_bytes: string;
}

/**
 * The file behind GET /api/v1/photos/:id, but only while a record or a project cover uses it: a
 * replaced (tombstoned) or detached file is not served. A visitor gets only files of a public
 * project, through its record or its cover, so a draft's photos stay hidden like its records
 * (NE-SEC-03); an admin session gets any live file.
 */
// A record photo has no project_key and a cover no record (housing_files_cover_shape), so the
// project is whichever one the file has.
export async function findLiveFile(sql: Sql, id: string, viewer: Viewer): Promise<LiveFile | null> {
  const [row] = await sql<LiveFile[]>`
    select f.storage_key, f.content_type, f.size_bytes
    from public.housing_files f left join public.housing_beneficiaries b on b.id = f.record_id
    where f.id = ${id} and f.deleted_at is null
      and coalesce(b.project_type, f.project_key) is not null
      and (${viewer.admin} or coalesce(b.project_type, f.project_key) = any(public.housing_public_project_keys()))`;
  return row ?? null;
}
