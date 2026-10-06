// Loads db/seed/dev.sql, then db/seed/demo-project.sql, into the local dev database as the schema owner.
// Usage: npm run db:seed (reads DATABASE_MIGRATION_URL from server/.env).
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { assertLocalDatabaseUrl } from './local-db.js';

const seedFiles = ['dev.sql', 'demo-project.sql'].map((name) => fileURLToPath(new URL(`../db/seed/${name}`, import.meta.url)));

async function main(): Promise<void> {
  const url = assertLocalDatabaseUrl('DATABASE_MIGRATION_URL', process.env.DATABASE_MIGRATION_URL);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    for (const file of seedFiles) await sql.file(file);
    const counts = await sql<{ project_type: string; n: number }[]>`select project_type, count(*)::int as n from public.housing_beneficiaries group by project_type order by project_type`;
    console.log(`seeded: ${counts.map((r) => `${r.project_type}=${r.n}`).join(', ')}`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
