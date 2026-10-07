// Loads db/seed/dev.sql, then db/seed/demo-project.sql, into the local dev database as the schema owner, in one
// transaction, so a failed seed leaves nothing behind.
// Usage: npm run db:seed [-- --if-empty] (reads DATABASE_MIGRATION_URL from server/.env).
//   --if-empty  seeds only a database that has never had records (every serial counter at 0). Counters never go
//               down, so a restart never brings back records someone deleted. compose.yaml's api runs it on start.
// Only local hosts are accepted, plus the compose database `db` when HOUSING_DEV_COMPOSE=1 (set only by compose.yaml).
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { assertLocalDatabaseUrl } from './local-db.js';

const seedFiles = ['dev.sql', 'demo-project.sql'].map((name) => fileURLToPath(new URL(`../db/seed/${name}`, import.meta.url)));

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { 'if-empty': { type: 'boolean' } }, strict: true });
  const extraHosts = process.env.HOUSING_DEV_COMPOSE === '1' ? ['db'] : [];
  const url = assertLocalDatabaseUrl('DATABASE_MIGRATION_URL', process.env.DATABASE_MIGRATION_URL, extraHosts);
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    if (values['if-empty']) {
      const [used] = await sql<{ any: boolean }[]>`select exists (select 1 from public.housing_serial_counters where last_serial > 0) as any`;
      if (used?.any) {
        console.log('seed skipped: this database already has had records');
        return;
      }
    }
    await sql.begin(async (tx) => {
      for (const file of seedFiles) await tx.file(file);
    });
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
