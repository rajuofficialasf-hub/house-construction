import { withActor } from '../db.js';
import { hashPassword, needsUpgrade, verifyDummy, verifyPassword } from './password.js';
import { createSession, deleteExpiredSessions } from './session.js';
import type { AdminPrincipal, AuthDeps } from './types.js';

type LoginFailure = 'unknown' | 'bad_password' | 'disabled' | 'changed';

export type LoginResult =
  | { ok: true; admin: AdminPrincipal; token: string; expiresAt: Date }
  // The reason is for the server log only; the client sees one message for all of them (AU-10).
  | { ok: false; reason: LoginFailure };

interface AdminRow extends AdminPrincipal {
  password_hash: string;
  disabled: boolean;
}

/**
 * Checks the password and, on success, starts a session and logs the login as that admin.
 * Every failure costs one password check, so timing doesn't reveal which emails are admins.
 */
export async function login(deps: AuthDeps, email: string, password: string): Promise<LoginResult> {
  const { sql, now } = deps;
  const [row] = await sql<AdminRow[]>`
    select id, email, name, password_hash, disabled_at is not null as disabled
    from public.housing_admins where email = ${email.trim().toLowerCase()}`;
  if (!row || row.disabled) {
    await verifyDummy(password);
    return { ok: false, reason: row ? 'disabled' : 'unknown' };
  }
  if (!(await verifyPassword(row.password_hash, password))) return { ok: false, reason: 'bad_password' };

  const admin: AdminPrincipal = { id: row.id, email: row.email, name: row.name };
  const upgraded = needsUpgrade(row.password_hash) ? await hashPassword(password) : undefined;
  const at = now();
  const session = await withActor(sql, admin, async (tx) => {
    // The password was checked outside this transaction. Lock the row and make sure the CLI
    // hasn't replaced the password or disabled the admin since, or the new session would
    // outlive the sessions the CLI just ended.
    const [unchanged] = await tx`select 1 from public.housing_admins
      where id = ${admin.id} and password_hash = ${row.password_hash} and disabled_at is null for update`;
    if (!unchanged) return undefined;
    if (upgraded) {
      await tx`update public.housing_admins set password_hash = ${upgraded}, updated_at = ${at} where id = ${admin.id}`;
    }
    await deleteExpiredSessions(tx, admin.id, at);
    const created = await createSession(tx, admin.id, at);
    await tx`select public.housing_log_event('login')`;
    return created;
  });
  if (!session) return { ok: false, reason: 'changed' };
  return { ok: true, admin, ...session };
}

/** Ends one session and logs the logout as its admin. */
export async function logout({ sql }: AuthDeps, admin: AdminPrincipal, sessionId: Buffer): Promise<void> {
  await withActor(sql, admin, async (tx) => {
    await tx`delete from public.housing_admin_sessions where token_hash = ${sessionId}`;
    await tx`select public.housing_log_event('logout')`;
  });
}
