// Reading the Supabase database for the one-time import (docs/plans/2026-10-06-1035-migrate-c7-cutover-plan.md).
// The connection can't write: Postgres is asked for read-only transactions at startup, and every
// read also runs in an explicit READ ONLY transaction, because a connection pooler may drop startup
// parameters. Rows travel as to_jsonb text, so timestamps keep their microseconds and jsonb values
// keep their exact numbers; the target loads them back with jsonb_populate_recordset.
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import type { Sql } from '../db.js';
import { CliError } from '../cli/prompt.js';

/** The tables copied as they are; their columns must be the same on both sides. */
export const COPIED_TABLES = ['housing_beneficiaries', 'housing_serial_counters', 'housing_serial_changes', 'housing_activity_log'] as const;

const SOURCE_TABLES = [...COPIED_TABLES.map((t) => `public.${t}`), 'public.housing_admins', 'auth.users'];
const ADMIN_COLUMNS = ['user_id', 'email'];
const AUTH_USER_COLUMNS = ['id', 'email', 'encrypted_password', 'raw_user_meta_data', 'created_at', 'deleted_at', 'banned_until'];

export const URL_COLUMNS = ['prev_photo_url', 'prev_thumb_url', 'current_photo_url', 'current_thumb_url'] as const;
export type UrlColumn = (typeof URL_COLUMNS)[number];

/** A record as to_jsonb gives it: every column, timestamps as UTC strings. */
export type SourceRecord = {
  id: string;
  project_type: string;
  serial_no: number;
  photo_updated_at: string | null;
} & Record<UrlColumn, string | null> &
  Record<string, unknown>;

export interface SourceUser {
  id: string;
  email: string | null;
  encrypted_password: string | null;
  name: string | null;
  created_at: string;
  deleted: boolean;
  banned: boolean;
}

export interface Snapshot {
  records: SourceRecord[];
  counters: { project_type: string; last_serial: number }[];
  /** jsonb array text, loaded into the target unchanged. */
  serialChangesJson: string;
  activityJson: string;
  /** The newest activity time in the source, or null for an empty log. */
  activityMaxAt: string | null;
  users: SourceUser[];
  timeZone: string;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
export const isLocalHost = (hostname: string) => LOCAL_HOSTS.has(hostname);

/** Where a postgres URL points, without its credentials; safe to print. */
export function describeDatabase(url: string): string {
  const u = new URL(url);
  return `${u.hostname}:${u.port || '5432'}/${u.pathname.slice(1)}`;
}

/**
 * Opens the read-only source connection. A non-local source must come with the provider's CA
 * certificate, so the password and the data only travel over a verified TLS connection.
 */
export function openSource(url: string, caFile: string | undefined): Sql {
  const { hostname } = new URL(url);
  const local = isLocalHost(hostname);
  if (!local && !caFile) throw new CliError('a non-local source needs --source-ca <file> (the provider’s CA certificate)');
  return postgres(url, {
    max: 1,
    connect_timeout: 15,
    ssl: caFile ? { ca: readFileSync(caFile), rejectUnauthorized: true } : false,
    connection: { default_transaction_read_only: true, TimeZone: 'UTC', application_name: 'housing-import' },
    onnotice: () => {},
  });
}

/** Runs fn in one READ ONLY repeatable-read transaction in UTC, so every read sees one snapshot. */
export async function readOnly<T>(sql: Sql, fn: (tx: postgres.TransactionSql) => Promise<T>): Promise<T> {
  return (await sql.begin('isolation level repeatable read read only', async (tx) => {
    await tx`set local time zone 'UTC'`;
    return fn(tx);
  })) as T;
}

async function columnsOf(sql: Sql, schema: string, table: string): Promise<string[]> {
  const rows = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_schema = ${schema} and table_name = ${table} order by column_name`;
  return rows.map((r) => r.column_name);
}

/**
 * Refuses a source the import can't copy exactly: a missing table, or a copied table whose columns
 * differ from the target's (a column added on Supabase must be ported as a migration first).
 */
export async function checkSource(source: Sql, target: Sql): Promise<void> {
  const problems: string[] = [];
  for (const table of SOURCE_TABLES) {
    const [row] = await source<{ found: string | null }[]>`select to_regclass(${table})::text as found`;
    if (!row?.found) problems.push(`the source has no ${table}`);
  }
  if (problems.length > 0) throw new CliError(problems.join('\n'));

  for (const table of COPIED_TABLES) {
    const [from, to] = await Promise.all([columnsOf(source, 'public', table), columnsOf(target, 'public', table)]);
    const missing = from.filter((c) => !to.includes(c));
    const extra = to.filter((c) => !from.includes(c));
    if (missing.length > 0) problems.push(`${table}: the target has no ${missing.join(', ')}; port the Supabase change as a migration first`);
    if (extra.length > 0) problems.push(`${table}: the source has no ${extra.join(', ')}`);
  }
  for (const [schema, table, needed] of [
    ['public', 'housing_admins', ADMIN_COLUMNS],
    ['auth', 'users', AUTH_USER_COLUMNS],
  ] as const) {
    const have = await columnsOf(source, schema, table);
    const missing = needed.filter((c) => !have.includes(c));
    if (missing.length > 0) problems.push(`${schema}.${table}: the source has no ${missing.join(', ')} (or no right to read them)`);
  }
  if (problems.length > 0) throw new CliError(problems.join('\n'));
}

const asJsonArray = (tx: postgres.TransactionSql, table: string) =>
  tx<{ rows: string }[]>`
    select coalesce(jsonb_agg(to_jsonb(t) order by t.id), '[]'::jsonb)::text as rows from ${tx(`public.${table}`)} t`;

/** Reads everything the import copies, from one snapshot. */
export async function readSnapshot(source: Sql): Promise<Snapshot> {
  return readOnly(source, async (tx) => {
    const [[tz], [records], counters, [changes], [activity], [maxAt], users] = await Promise.all([
      tx<{ TimeZone: string }[]>`show time zone`,
      asJsonArray(tx, 'housing_beneficiaries'),
      tx<{ project_type: string; last_serial: number }[]>`
        select project_type, last_serial from public.housing_serial_counters order by project_type`,
      asJsonArray(tx, 'housing_serial_changes'),
      asJsonArray(tx, 'housing_activity_log'),
      tx<{ at: string | null }[]>`select max(at)::text as at from public.housing_activity_log`,
      tx<SourceUser[]>`
        select u.id, u.email, u.encrypted_password,
          coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name') as name,
          u.created_at::text as created_at,
          u.deleted_at is not null as deleted,
          coalesce(u.banned_until > now(), false) as banned
        from public.housing_admins a join auth.users u on u.id = a.user_id
        order by u.id`,
    ]);
    return {
      records: JSON.parse(records!.rows) as SourceRecord[],
      counters,
      serialChangesJson: changes!.rows,
      activityJson: activity!.rows,
      activityMaxAt: maxAt!.at,
      users,
      timeZone: tz!.TimeZone,
    };
  });
}
