import { withActor, type Actor, type Sql } from '../db.js';
import { ADMIN_RECORD_COLUMNS, type ProjectRecord, type RecordProject } from './reads.js';
import type { RecordCreateBody, RecordPatchBody } from './schemas.js';

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
