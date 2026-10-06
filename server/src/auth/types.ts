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
}

/** A main_admin may also delete; see server/db/migrations/0012_admin_roles.sql. */
export const ADMIN_ROLES = ['admin', 'main_admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface AuthDeps {
  sql: Sql;
  /** Injected so tests can move time; production passes `() => new Date()`. */
  now: () => Date;
}
