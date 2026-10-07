import { withActor, type Actor, type Sql } from '../db.js';
import { emptiedField, emptyingRefused } from './editorRules.js';
import type { RecordProject } from './reads.js';
import type { PrivateBody } from './schemas.js';

// A record's private values, such as a phone number (docs/api/PROJECTS_API_CONTRACT.md §4.4.8).
// Only the admin routes call these. The values never reach a log or an error: the trigger
// (0013_record_rules.sql) checks them and names only the field key.

export type PrivateValues = Record<string, string | number>;

/** The record's private values, {} when it has none; null when the record doesn't exist. */
export async function getPrivate(sql: Sql, id: string): Promise<PrivateValues | null> {
  const [row] = await sql<{ data: PrivateValues | null }[]>`
    select p.data from public.housing_beneficiaries b
    left join public.housing_beneficiary_private p on p.record_id = b.id
    where b.id = ${id}`;
  return row ? (row.data ?? {}) : null;
}

/**
 * Replaces the record's private values with `data` and returns them as stored; null when the record
 * doesn't exist. An existing row is updated, never upserted: Postgres runs the BEFORE INSERT
 * trigger of an upsert first, with no old row, which would refuse an unchanged value of a field
 * archived since. The record's row lock serialises two saves to the same record. With refuseEmptying
 * (an editor's save), emptying a stored value throws 403 naming `extra.<key>`.
 */
export async function putPrivate(
  sql: Sql,
  actor: Actor,
  id: string,
  data: PrivateBody['data'],
  { refuseEmptying = false }: { refuseEmptying?: boolean } = {},
): Promise<PrivateValues | null> {
  return withActor(sql, actor, async (tx) => {
    const locked = await tx`select id from public.housing_beneficiaries where id = ${id} for update`;
    if (locked.length === 0) return null;
    if (refuseEmptying) {
      const [stored] = await tx<{ data: PrivateValues }[]>`select data from public.housing_beneficiary_private where record_id = ${id}`;
      const emptied = emptiedField({ extra: stored?.data ?? {} }, { extra: data });
      if (emptied) throw emptyingRefused(emptied);
    }
    const json = tx.json(data as never);
    const [updated] = await tx<{ data: PrivateValues }[]>`
      update public.housing_beneficiary_private set data = ${json} where record_id = ${id} returning data`;
    if (updated) return updated.data;
    const [inserted] = await tx<{ data: PrivateValues }[]>`
      insert into public.housing_beneficiary_private (record_id, data) values (${id}, ${json}) returning data`;
    if (!inserted) throw new Error('insert returned no row');
    return inserted.data;
  });
}

/** Private values of these records of one project, by id; records of other projects and records with none are left out. */
export async function getPrivateMany(sql: Sql, project: RecordProject, ids: string[]): Promise<Record<string, PrivateValues>> {
  if (ids.length === 0) return {};
  const rows = await sql<{ record_id: string; data: PrivateValues }[]>`
    select p.record_id, p.data from public.housing_beneficiary_private p
    join public.housing_beneficiaries b on b.id = p.record_id
    where b.project_type = ${project.key} and p.record_id in ${sql(ids)} and p.data <> '{}'::jsonb`;
  return Object.fromEntries(rows.map((row) => [row.record_id, row.data]));
}
