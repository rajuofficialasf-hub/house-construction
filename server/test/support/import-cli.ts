import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testOwnerUrl } from './env.js';
import { TEST_PUBLIC_API_URL } from './storage.js';

const serverDir = fileURLToPath(new URL('../..', import.meta.url));
const tsx = fileURLToPath(new URL('../../node_modules/.bin/tsx', import.meta.url));

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs the import CLI as an operator would: the source URL piped to its prompt, the target as the
 * owner of housing_test, photos on a NAS folder. `env` adds to or overrides those settings.
 */
export function importCli(args: string[], stdin: string, env: Record<string, string> = {}): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = execFile(
      tsx,
      ['src/cli/import-supabase.ts', ...args],
      {
        cwd: serverDir,
        env: {
          ...process.env,
          DATABASE_MIGRATION_URL: testOwnerUrl,
          PUBLIC_API_URL: TEST_PUBLIC_API_URL,
          STORAGE_DRIVER: 'nas',
          STORAGE_ROOT: '/nonexistent-set-by-test',
          ...env,
        },
      },
      (err, stdout, stderr) => resolve({ code: err ? Number(err.code ?? 1) : 0, stdout, stderr }),
    );
    child.stdin?.end(stdin);
  });
}
