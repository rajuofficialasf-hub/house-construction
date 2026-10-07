import type { Sql } from '../db.js';

/**
 * The signed-in admin, as the session middleware puts it on `req.admin`. A login from another
 * source (a host app, later) must produce the same shape.
 */
export interface AdminPrincipal {
  id: string;
  email: string;
  name: string | null;
  /** Read with the session on every request, so a role change applies without a new login. */
  role: AdminRole;
  /** True for a main admin, an admin, and an editor with "all projects"; then `projects` is empty. */
  allProjects: boolean;
  /** An editor's project keys, groups expanded to their children (housing_admin_project_keys). */
  projects: string[];
}

/**
 * A main_admin may also delete (server/db/migrations/0012_admin_roles.sql); an editor is limited to
 * its projects and may only add and fill in (server/db/migrations/0019_editor_role.sql, src/auth/scope.ts).
 */
export const ADMIN_ROLES = ['admin', 'editor', 'main_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AuthDeps {
  sql: Sql;
  /** Injected so tests can move time; production passes `() => new Date()`. */
  now: () => Date;
}
