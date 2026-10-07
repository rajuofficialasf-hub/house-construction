import { withActor, type Actor, type Sql } from '../db.js';
import { likePattern, toPage, type Page } from './reads.js';
import type { ActivityBody, ActivityQuery } from './schemas.js';

/** The /api/v1/activity query and body: project_type is any registry key, not activityQuery's two-value enum. */
type AnyActivityQuery = Omit<ActivityQuery, 'project_type'> & { project_type?: string | undefined };
type AnyActivityBody = Omit<ActivityBody, 'action' | 'project_type'> & { action: string; project_type?: string | undefined };

// The admin activity log (docs/api/PROJECTS_API_CONTRACT.md §4.5).
// Record and private-value writes are logged by the triggers (0014_record_functions_v2.sql); this
// file reads the log and records the client's own events.

export interface ActivityEntry {
  id: number;
  at: Date;
  actor_id: string | null;
  actor_email: string | null;
  action: string;
  project_type: string | null;
  record_id: string | null;
  serial_no: number | null;
  record_name: string | null;
  details: Record<string, unknown>;
}

/** One page of the log, newest first, with the filtered total. */
export async function listActivity(sql: Sql, query: AnyActivityQuery): Promise<Page<ActivityEntry>> {
  const conditions = [sql`true`];
  if (query.action) conditions.push(sql`action = ${query.action}`);
  if (query.project_type) conditions.push(sql`project_type = ${query.project_type}`);
  if (query.record_id) conditions.push(sql`record_id = ${query.record_id}`);
  if (query.actor_email) conditions.push(sql`actor_email ilike ${likePattern(query.actor_email)} escape '\\'`);
  if (query.from) conditions.push(sql`at >= ${query.from}`);
  if (query.to) conditions.push(sql`at <= ${query.to}`);
  const where = conditions.reduce((all, condition) => sql`${all} and ${condition}`);

  const [rows, [count]] = await Promise.all([
    // id is bigserial, which postgres.js returns as a string; float8 is exact far beyond any real log.
    sql<ActivityEntry[]>`
      select id::float8 as id, at, actor_id, actor_email, action, project_type, record_id, serial_no, record_name, details
      from public.housing_activity_log where ${where}
      order by at desc, id desc
      limit ${query.page_size} offset ${(query.page - 1) * query.page_size}`,
    sql<{ total: number }[]>`select count(*)::int as total from public.housing_activity_log where ${where}`,
  ]);
  return toPage(rows, query, count?.total ?? 0);
}

/** Records a client event (an import run, a bulk photo run) for the admin; returns its id. */
export async function logEvent(sql: Sql, actor: Actor, body: AnyActivityBody): Promise<number> {
  return withActor(sql, actor, async (tx) => {
    const [row] = await tx<{ id: number }[]>`
      select public.housing_log_event(${body.action}, ${tx.json(body.details as never)}, ${body.project_type ?? null})::float8 as id`;
    if (!row) throw new Error('housing_log_event returned no row');
    return row.id;
  });
}
