// Removes photo files whose removal failed after commit (housing_files rows with deleted_at set).
// Safe to run at any time and as often as wanted; C6 schedules it. Uses the API's own settings, so
// it works on whichever STORAGE_DRIVER the API uses. Exits 1 if any file could not be removed.
//
//   npm run files:sweep
import { ConfigError, loadConfig } from '../config.js';
import { createDb } from '../db.js';
import { createLogger } from '../logger.js';
import { sweepTombstones } from '../photos/sweep.js';
import { createStorage } from '../storage/index.js';

async function main(): Promise<number> {
  const config = loadConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const sql = createDb(config.DATABASE_URL);
  try {
    const { removed, failed } = await sweepTombstones(sql, createStorage(config), logger);
    console.log(`files:sweep removed ${removed}, failed ${failed}`);
    return failed > 0 ? 1 : 0;
  } finally {
    await sql.end();
  }
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err instanceof ConfigError ? err.message : err);
    process.exit(1);
  },
);
