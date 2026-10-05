import type { Sql } from '../db.js';

/**
 * The signed-in admin, as the session middleware puts it on `req.admin`. A login from another
 * source (a host app, later) must produce the same shape.
 */
export interface AdminPrincipal {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthDeps {
  sql: Sql;
  /** Injected so tests can move time; production passes `() => new Date()`. */
  now: () => Date;
}
