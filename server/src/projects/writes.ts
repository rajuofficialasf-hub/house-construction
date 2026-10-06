import { withActor, type Actor, type Sql, type Tx } from '../db.js';
import type { ProjectCreateBody, ProjectPatchBody } from './schemas.js';

// The project registry writes (docs/api/PROJECTS_API_CONTRACT.md §4.1). Each runs in one withActor()
// transaction, so the config log trigger records the session's admin. The guards in
// 0015_project_guards.sql check every rule and raise HC400 with a field key; who may write is the
// route's check.

/** The jsonb columns, bound as JSON rather than as text (DB rule: JSON binding). */
function withJson<T extends Partial<Record<'core_fields' | 'stat_cards' | 'display', unknown>>>(tx: Tx, values: T): T {
  const out: Record<string, unknown> = { ...values };
  for (const column of ['core_fields', 'stat_cards', 'display'] as const) {
    if (values[column] !== undefined) out[column] = tx.json(values[column] as never);
  }
  return out as T;
}

/** Creates the project and its fields as a draft in one call; the trigger adds its serial counter. Returns the key. */
export async function createProject(sql: Sql, actor: Actor, body: ProjectCreateBody): Promise<string> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<{ key: string }[]>`
      select public.housing_project_create(${tx.json(body.project as never)}, ${tx.json(body.fields as never)}) as key`;
    if (!row) throw new Error('housing_project_create returned no row');
    return row.key;
  });
}

export type UpdateResult = 'updated' | 'conflict' | 'missing';

/**
 * Changes only the given columns. With ifMatch, the row must still have that updated_at, compared
 * to the millisecond as JSON carries it; the check is in the update itself, so two admins can't
 * both pass it.
 */
export async function updateProject(sql: Sql, actor: Actor, key: string, patch: ProjectPatchBody, ifMatch?: string): Promise<UpdateResult> {
  return withActor(sql, actor, async (tx) => {
    const changes = withJson(tx, patch);
    const updated =
      ifMatch === undefined
        ? await tx`update public.housing_projects set ${tx(changes)} where key = ${key} returning key`
        : await tx`update public.housing_projects set ${tx(changes)}
                   where key = ${key} and date_trunc('milliseconds', updated_at) = ${ifMatch}::timestamptz returning key`;
    if (updated.length > 0) return 'updated';
    const [exists] = await tx`select 1 from public.housing_projects where key = ${key}`;
    return exists ? 'conflict' : 'missing';
  });
}

/** Deletes a project and its unused fields; false when it doesn't exist. The guard refuses one that ever held records. */
export async function deleteProject(sql: Sql, actor: Actor, key: string): Promise<boolean> {
  return withActor(sql, actor, async (tx) => {
    const [locked] = await tx`select 1 from public.housing_projects where key = ${key} for update`;
    if (!locked) return false;
    await tx`delete from public.housing_projects where key = ${key}`;
    return true;
  });
}

/** Sets sort_order 10, 20, ... in the given order; unknown keys are ignored and nothing is logged. */
export async function reorderProjects(sql: Sql, actor: Actor, keys: string[]): Promise<void> {
  await withActor(sql, actor, (tx) => tx`select public.housing_projects_reorder(${keys})`);
}
