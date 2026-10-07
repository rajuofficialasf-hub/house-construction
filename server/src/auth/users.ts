import { withActor, type Actor, type Sql } from '../db.js';
import type { AdminUser, AdminUserBody } from './userSchemas.js';
import type { AdminRole } from './types.js';

// The users page's list query and save (docs/api/PROJECTS_API_CONTRACT.md §4.6). The route checks
// that the caller is the main admin; housing_admin_user_save (server/db/migrations/0019_editor_role.sql)
// keeps the data whole and is the only way the app role changes a role.

/** The admin table is small; the cap only bounds the query (DB-Q-04). */
const MAX_LISTED = 500;

/** One select for the list and the saved row, so both answer the same shape. No hash or token. */
function selectUsers(sql: Sql, id?: string) {
  return sql<AdminUser[]>`
    select a.id, a.email, a.name, a.role,
      (a.role <> 'editor' or a.all_projects) as all_projects,
      a.disabled_at is null as is_active,
      case when a.role = 'editor' and not a.all_projects
        then coalesce((select array_agg(ap.project_key order by ap.project_key)
                         from public.housing_admin_projects ap where ap.admin_id = a.id), '{}')
        else '{}'::text[] end as projects,
      a.created_at,
      (select max(s.last_seen_at) from public.housing_admin_sessions s where s.admin_id = a.id) as last_seen_at
    from public.housing_admins a
    ${id ? sql`where a.id = ${id}` : sql``}
    order by (a.role = 'main_admin') desc, a.created_at, a.id
    limit ${MAX_LISTED}`;
}

/** Every login, the main admin first, then by creation. */
export function listAdminUsers(sql: Sql): Promise<AdminUser[]> {
  return selectUsers(sql);
}

/** The login with this (normalised) email, if any. */
export async function findAdminByEmail(sql: Sql, email: string): Promise<{ id: string; role: AdminRole } | undefined> {
  const [row] = await sql<{ id: string; role: AdminRole }[]>`select id, role from public.housing_admins where email = ${email}`;
  return row;
}

/** Saves an existing login's role, projects and status as the actor, and returns the saved row. */
export async function saveAdminUser(sql: Sql, actor: Actor, body: AdminUserBody): Promise<AdminUser> {
  const id = await withActor(sql, actor, async (tx) => {
    const [row] = await tx<{ id: string }[]>`
      select public.housing_admin_user_save(${body.email}, ${body.role}, ${body.all_projects}, ${body.projects}, ${body.is_active}) as id`;
    return row?.id;
  });
  const [saved] = id ? await selectUsers(sql, id) : [];
  if (!saved) throw new Error('the saved login is gone');
  return saved;
}
