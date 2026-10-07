// Admin management from the server's command line. There is no signup: this is the only way to
// create, re-password, disable or enable an admin. Passwords are read from a prompt (or one line
// of piped stdin), never from arguments or the environment, so they don't land in shell history.
// Connects as the schema owner through DATABASE_MIGRATION_URL.
//
//   admin create --email <email> [--name <name>] [--role admin|main_admin]
//   admin set-role --email <email> --role admin|main_admin
//   admin set-password --email <email>
//   admin disable --email <email>
//   admin enable --email <email>
//   admin list            (the hash column shows 'none' for a row that can't log in)
import { parseArgs } from 'node:util';
import postgres from 'postgres';
import { z } from 'zod';
import { AdminCliError, createAdmin, listAdmins, parseRole, setDisabled, setPassword, setRole } from '../auth/admins.js';
import { readSecret } from './prompt.js';

const COMMANDS = ['create', 'set-role', 'set-password', 'disable', 'enable', 'list'] as const;
type Command = (typeof COMMANDS)[number];
const isCommand = (value: string | undefined): value is Command => COMMANDS.some((c) => c === value);

const USAGE = `usage:
  admin create --email <email> [--name <name>] [--role admin|main_admin]
  admin set-role --email <email> --role admin|main_admin
  admin set-password --email <email>
  admin disable --email <email>
  admin enable --email <email>
  admin list`;

const readPassword = () => readSecret('Password', { confirm: true });

function requireEmail(email: string | undefined): string {
  if (!email) throw new AdminCliError(`--email is required\n${USAGE}`);
  return email;
}

async function run(args: string[]): Promise<void> {
  const { positionals, values } = parseArgs({
    args,
    options: { email: { type: 'string' }, name: { type: 'string' }, role: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  });
  const [command, ...extra] = positionals;
  if (!isCommand(command) || extra.length > 0) throw new AdminCliError(USAGE);
  // Checked before connecting, so a typo changes nothing.
  const role = values.role === undefined ? undefined : parseRole(values.role);

  // The CLI's only setting, parsed like the API's config (NE-CFG-01); the value is never echoed.
  const env = z.object({ DATABASE_MIGRATION_URL: z.url({ protocol: /^postgres(ql)?$/ }) }).safeParse(process.env);
  if (!env.success) throw new AdminCliError('DATABASE_MIGRATION_URL must be set to the owner role’s postgres URL');
  const url = env.data.DATABASE_MIGRATION_URL;
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  try {
    switch (command) {
      case 'create': {
        const email = requireEmail(values.email);
        const admin = await createAdmin(sql, { email, name: values.name, role, password: await readPassword() });
        console.log(`created ${admin.role} ${admin.email} (${admin.id})`);
        break;
      }
      case 'set-role': {
        const email = requireEmail(values.email);
        if (!role) throw new AdminCliError(`--role is required\n${USAGE}`);
        await setRole(sql, email, role);
        console.log(`${email} is now ${role}`);
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
          console.log(`${admin.id}  ${admin.email}  ${admin.role}  ${status}  ${admin.hash}  ${admin.name ?? '-'}  ${admin.created_at.toISOString()}`);
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
