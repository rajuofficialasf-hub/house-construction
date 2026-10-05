import { readdirSync } from 'node:fs';
import { ownerDb } from './db.js';
import { testOwnerUrl } from './env.js';
import { dbmate } from './migrate.js';

const migrationCount = readdirSync(new URL('../../db/migrations', import.meta.url)).filter((f) => f.endsWith('.sql')).length;

// Rebuilds the test database from nothing before the suite: every migration must apply to an
// empty database, and every down section must undo its up section.
export default async function setup(): Promise<void> {
  const sql = ownerDb();
  try {
    await sql`drop schema if exists public cascade`;
    await sql`create schema public`;

    await dbmate(testOwnerUrl, 'up');
    for (let i = 0; i < migrationCount; i++) await dbmate(testOwnerUrl, 'rollback');
    const left = await sql`
      select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname like 'housing%'
      union all
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'housing%'`;
    if (left.length > 0) {
      throw new Error(`down migrations left objects behind: ${left.map((r) => r.relname as string).join(', ')}`);
    }
    await dbmate(testOwnerUrl, 'up');
  } finally {
    await sql.end();
  }
}
