// Admin management from the server's command line. There is no signup: this is the only way to
// create, re-password, disable or enable an admin. Passwords are read from a prompt (or one line
// of piped stdin), never from arguments or the environment, so they don't land in shell history.
// Connects as the schema owner through DATABASE_MIGRATION_URL.
//
//   admin create --email <email> [--name <name>]
//   admin set-password --email <email>
//   admin disable --email <email>
//   admin enable --email <email>
//   admin list
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { z } from 'zod';
import { AdminCliError, createAdmin, listAdmins, setDisabled, setPassword } from '../auth/admins.js';

const COMMANDS = ['create', 'set-password', 'disable', 'enable', 'list'] as const;
type Command = (typeof COMMANDS)[number];
const isCommand = (value: string | undefined): value is Command => COMMANDS.some((c) => c === value);

const USAGE = `usage:
  admin create --email <email> [--name <name>]
  admin set-password --email <email>
  admin disable --email <email>
  admin enable --email <email>
  admin list`;

/** Reads a password: hidden and asked twice on a terminal, one line from piped stdin otherwise. */
async function readPassword(): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, terminal: false });
    for await (const line of rl) {
      rl.close();
      return line;
    }
    throw new AdminCliError('no password given on stdin');
  }
  let muted = false;
  const output = new Writable({
    write(chunk, encoding, done) {
      if (!muted) process.stdout.write(chunk, encoding);
      done();
    },
  });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  const ask = async (prompt: string) => {
    process.stdout.write(prompt);
    muted = true;
    const answer = await rl.question('');
    muted = false;
    process.stdout.write('\n');
    return answer;
  };
  try {
    const password = await ask('Password: ');
    if ((await ask('Repeat password: ')) !== password) throw new AdminCliError('the passwords do not match');
    return password;
  } finally {
    rl.close();
  }
}

function requireEmail(email: string | undefined): string {
  if (!email) throw new AdminCliError(`--email is required\n${USAGE}`);
  return email;
}

async function run(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    options: { email: { type: 'string' }, name: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  });
  const [command, ...extra] = positionals;
  if (!isCommand(command) || extra.length > 0) throw new AdminCliError(USAGE);

  // The CLI's only setting, parsed like the API's config (NE-CFG-01); the value is never echoed.
  const env = z.object({ DATABASE_MIGRATION_URL: z.url({ protocol: /^postgres(ql)?$/ }) }).safeParse(process.env);
  if (!env.success) throw new AdminCliError('DATABASE_MIGRATION_URL must be set to the owner role’s postgres URL');
  const url = env.data.DATABASE_MIGRATION_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    switch (command) {
      case 'create': {
        const email = requireEmail(values.email);
        const admin = await createAdmin(sql, { email, name: values.name, password: await readPassword() });
        console.log(`created admin ${admin.email} (${admin.id})`);
        break;
      }
      case 'set-password': {
        const email = requireEmail(values.email);
        await setPassword(sql, email, await readPassword());
        console.log(`set a new password for ${email} and ended their sessions`);
        break;
      }
      case 'disable':
      case 'enable': {
        const email = requireEmail(values.email);
        await setDisabled(sql, email, command === 'disable');
        console.log(`${command}d ${email}`);
        break;
      }
      case 'list':
        for (const admin of await listAdmins(sql)) {
          const status = admin.disabled ? 'disabled' : 'active';
          console.log(`${admin.id}  ${admin.email}  ${status}  ${admin.name ?? '-'}  ${admin.created_at.toISOString()}`);
        }
        break;
    }
  } finally {
    await sql.end();
  }
}

run(process.argv.slice(2)).catch((err: unknown) => {
  // Argument errors from parseArgs and AdminCliError are meant for the operator; anything else
  // (a database error) is shown by message only, never with connection details or a stack.
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
