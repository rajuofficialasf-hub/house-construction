import { z } from 'zod';
import type { Sql, Tx } from '../db.js';
import { hashPassword } from './password.js';
import type { AdminPrincipal } from './types.js';

// Creating and changing admins. Only the admin CLI calls these, connected as the schema owner:
// the API role has no right to insert admins or change anything but a password hash.
// Each change writes an activity row with no actor set, so it is logged as the owner role.

/** A refusal the CLI shows to the operator as is. */
export class AdminCliError extends Error {
  override name = 'AdminCliError';
}

const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 200;

function parseEmail(email: string): string {
  const result = emailSchema.safeParse(email);
  if (!result.success) throw new AdminCliError(`not a valid email: ${email}`);
  return result.data;
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
    throw new AdminCliError(`the password must be ${MIN_PASSWORD_LENGTH}–${MAX_PASSWORD_LENGTH} characters`);
  }
}

async function logChange(tx: Tx, action: string, email: string): Promise<void> {
  await tx`select public.housing_log_event(${action}, ${tx.json({ email })})`;
}

/** Updates the admin with this email inside a transaction, or throws when there is none. */
async function changeAdmin(sql: Sql, email: string, action: string, change: (tx: Tx, id: string) => Promise<void>): Promise<void> {
  const address = parseEmail(email);
  await sql.begin(async (tx) => {
    const [admin] = await tx<{ id: string }[]>`select id from public.housing_admins where email = ${address} for update`;
    if (!admin) throw new AdminCliError(`no admin with email ${address}`);
    await change(tx, admin.id);
    await logChange(tx, action, address);
  });
}

export async function createAdmin(
  sql: Sql,
  input: { email: string; name?: string | undefined; password: string },
): Promise<AdminPrincipal> {
  const email = parseEmail(input.email);
  checkPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  return (await sql.begin(async (tx) => {
    const [admin] = await tx<AdminPrincipal[]>`
      insert into public.housing_admins (email, name, password_hash)
      values (${email}, ${input.name?.trim() || null}, ${passwordHash})
      on conflict (email) do nothing
      returning id, email, name`;
    if (!admin) throw new AdminCliError(`an admin with email ${email} already exists`);
    await logChange(tx, 'admin_create', email);
    return admin;
  })) as AdminPrincipal;
}

/** Sets a new password and ends the admin's sessions, so a leaked session dies with the old password. */
export async function setPassword(sql: Sql, email: string, password: string): Promise<void> {
  checkPassword(password);
  const passwordHash = await hashPassword(password);
  await changeAdmin(sql, email, 'admin_password_set', async (tx, id) => {
    await tx`update public.housing_admins set password_hash = ${passwordHash}, updated_at = now() where id = ${id}`;
    await tx`delete from public.housing_admin_sessions where admin_id = ${id}`;
  });
}

/** Disables an admin (ending their sessions) or enables them again with their old password. */
export async function setDisabled(sql: Sql, email: string, disabled: boolean): Promise<void> {
  await changeAdmin(sql, email, disabled ? 'admin_disable' : 'admin_enable', async (tx, id) => {
    await tx`update public.housing_admins
      set disabled_at = ${disabled ? tx`coalesce(disabled_at, now())` : null}, updated_at = now() where id = ${id}`;
    if (disabled) await tx`delete from public.housing_admin_sessions where admin_id = ${id}`;
  });
}

export interface AdminListing extends AdminPrincipal {
  disabled: boolean;
  created_at: Date;
}

export async function listAdmins(sql: Sql): Promise<AdminListing[]> {
  return sql<AdminListing[]>`
    select id, email, name, disabled_at is not null as disabled, created_at
    from public.housing_admins order by email`;
}
