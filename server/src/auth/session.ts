import { createHash, randomBytes } from 'node:crypto';
import type { Tx } from '../db.js';
import type { AdminPrincipal, AuthDeps } from './types.js';

// Admin sessions: an opaque random token in the cookie, its SHA-256 in housing_admin_sessions.

export const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
export const ABSOLUTE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/** The session id stored in the database for a cookie token. */
export function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

/** Starts a session for the admin inside the caller's transaction and returns the cookie token. */
export async function createSession(tx: Tx, adminId: string, now: Date): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + ABSOLUTE_TIMEOUT_MS);
  await tx`insert into public.housing_admin_sessions (token_hash, admin_id, created_at, last_seen_at, expires_at)
    values (${hashSessionToken(token)}, ${adminId}, ${now}, ${now}, ${expiresAt})`;
  return { token, expiresAt };
}

/** Deletes the admin's sessions that have passed either timeout. */
export async function deleteExpiredSessions(tx: Tx, adminId: string, now: Date): Promise<void> {
  await tx`delete from public.housing_admin_sessions
    where admin_id = ${adminId}
      and (expires_at <= ${now} or last_seen_at <= ${new Date(now.getTime() - IDLE_TIMEOUT_MS)})`;
}

/**
 * Returns the admin for a live session and marks it used, or null when the session is unknown,
 * past either timeout, or belongs to a disabled admin. One statement checks and slides it.
 */
export async function authenticate({ sql, now }: AuthDeps, tokenHash: Buffer): Promise<AdminPrincipal | null> {
  const at = now();
  const [admin] = await sql<AdminPrincipal[]>`
    update public.housing_admin_sessions s set last_seen_at = ${at}
    from public.housing_admins a
    where s.token_hash = ${tokenHash}
      and a.id = s.admin_id
      and a.disabled_at is null
      and s.last_seen_at > ${new Date(at.getTime() - IDLE_TIMEOUT_MS)}
      and s.expires_at > ${at}
    returning a.id, a.email, a.name`;
  return admin ?? null;
}
