import postgres from 'postgres';
import type { Sql, Tx } from '../db.js';
import { emailSchema, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from './credentials.js';
import { hashPassword } from './password.js';
import { ADMIN_ROLES, type AdminPrincipal, type AdminRole } from './types.js';

// Creating and changing admins. Only the admin CLI calls these, connected as the schema owner:
// the API role has no right to insert admins or change anything but a password hash.
// Each change writes an activity row with no actor set, so it is logged as the owner role.

/** A refusal the CLI shows to the operator as is. */
export class AdminCliError extends Error {
  override name = 'AdminCliError';
}

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

export function parseRole(role: string): AdminRole {
  const found = ADMIN_ROLES.find((r) => r === role);
  if (!found) throw new AdminCliError(`the role must be ${ADMIN_ROLES.slice(0, -1).join(', ')} or ${ADMIN_ROLES.at(-1)}, got ${role}`);
  return found;
}

/** Logged with the email; never a password or hash. */
type LogExtra = { role?: AdminRole };

async function logChange(tx: Tx, action: string, email: string, extra: LogExtra = {}): Promise<void> {
  await tx`select public.housing_log_event(${action}, ${tx.json({ email, ...extra })})`;
}

const ONE_MAIN_ADMIN = 'housing_admins_one_main_admin';

const mainAdminExists = (email: string) => new AdminCliError(`a main admin already exists: ${email}; demote them first with set-role`);

/**
 * Refuses to make a second main_admin, naming the one who holds the role, so the operator knows
 * whom to demote. Locks that row so a concurrent change waits; the unique index
 * housing_admins_one_main_admin is the backstop.
 */
async function assertNoOtherMainAdmin(tx: Tx, exceptId: string | null): Promise<void> {
  const [holder] = await tx<{ email: string }[]>`
    select email from public.housing_admins
    where role = 'main_admin' and id is distinct from ${exceptId} for update`;
  if (holder) throw mainAdminExists(holder.email);
}

/**
 * Two changes that both found no main_admin (neither had a row to lock) meet at the unique index.
 * The loser gets the same plain refusal as assertNoOtherMainAdmin, not the raw 23505.
 */
async function refuseSecondMainAdmin<T>(sql: Sql, change: Promise<T>): Promise<T> {
  try {
    return await change;
  } catch (err) {
    if (!(err instanceof postgres.PostgresError) || err.code !== '23505' || err.constraint_name !== ONE_MAIN_ADMIN) throw err;
    const [holder] = await sql<{ email: string }[]>`select email from public.housing_admins where role = 'main_admin'`;
    throw holder ? mainAdminExists(holder.email) : new AdminCliError('another change to the main admin ran at the same time; try again');
  }
}

/** Updates the admin with this email inside a transaction, or throws when there is none. */
async function changeAdmin(
  sql: Sql,
  email: string,
  action: string,
  change: (tx: Tx, id: string) => Promise<void>,
  extra: LogExtra = {},
): Promise<void> {
  const address = parseEmail(email);
  await sql.begin(async (tx) => {
    const [admin] = await tx<{ id: string }[]>`select id from public.housing_admins where email = ${address} for update`;
    if (!admin) throw new AdminCliError(`no admin with email ${address}`);
    await change(tx, admin.id);
    await logChange(tx, action, address, extra);
  });
}

/** An admin as the CLI prints it. */
type CliAdmin = Pick<AdminPrincipal, 'id' | 'email' | 'name' | 'role'>;

/** Creates a login. A new editor has no projects until the main admin gives it some on /admin/users. */
export async function createAdmin(
  sql: Sql,
  input: { email: string; name?: string | undefined; password: string; role?: AdminRole | undefined },
): Promise<CliAdmin> {
  const email = parseEmail(input.email);
  const role = input.role ?? 'admin';
  checkPassword(input.password);
  const passwordHash = await hashPassword(input.password);
  const created = sql.begin(async (tx) => {
    if (role === 'main_admin') await assertNoOtherMainAdmin(tx, null);
    const [admin] = await tx<CliAdmin[]>`
      insert into public.housing_admins (email, name, password_hash, role)
      values (${email}, ${input.name?.trim() || null}, ${passwordHash}, ${role})
      on conflict (email) do nothing
      returning id, email, name, role`;
    if (!admin) throw new AdminCliError(`an admin with email ${email} already exists`);
    await logChange(tx, 'admin_create', email);
    return admin;
  });
  return (await refuseSecondMainAdmin(sql, created)) as CliAdmin;
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

/**
 * Gives the admin a role. The new role applies on their next request, since the session lookup
 * reads it each time. Only one admin may be main_admin. An editor's assignments stay when it
 * becomes an admin; only an editor reads them.
 */
export async function setRole(sql: Sql, email: string, role: AdminRole): Promise<void> {
  const changed = changeAdmin(
    sql,
    email,
    'admin_role_set',
    async (tx, id) => {
      if (role === 'main_admin') await assertNoOtherMainAdmin(tx, id);
      await tx`update public.housing_admins set role = ${role}, updated_at = now() where id = ${id}`;
    },
    { role },
  );
  await refuseSecondMainAdmin(sql, changed);
}

export interface AdminListing extends CliAdmin {
  disabled: boolean;
  /** 'all', an editor's assigned keys joined by commas, or 'none'. */
  projects: string;
  /** 'none' marks a row whose hash isn't argon2id, which can never log in. */
  hash: 'argon2id' | 'none';
  created_at: Date;
}

export async function listAdmins(sql: Sql): Promise<AdminListing[]> {
  return sql<AdminListing[]>`
    select a.id, a.email, a.name, a.role, a.disabled_at is not null as disabled,
      case when a.password_hash like '$argon2id$%' then 'argon2id' else 'none' end as hash,
      case when a.role <> 'editor' or a.all_projects then 'all'
           else coalesce(string_agg(ap.project_key, ',' order by ap.project_key), 'none') end as projects,
      a.created_at
    from public.housing_admins a
    left join public.housing_admin_projects ap on ap.admin_id = a.id
    group by a.id
    order by a.email`;
}
