import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const serverDir = fileURLToPath(new URL('../..', import.meta.url));
const dbmateBin = fileURLToPath(new URL('../../node_modules/.bin/dbmate', import.meta.url));

/** Runs a dbmate command (up, rollback, status) against the given database as its owner. */
export async function dbmate(ownerUrl: string, ...args: string[]): Promise<string> {
  const { stdout } = await run(dbmateBin, ['--migrations-dir', 'db/migrations', '--no-dump-schema', ...args], {
    cwd: serverDir,
    env: { ...process.env, DATABASE_URL: ownerUrl },
  });
  return stdout;
}
