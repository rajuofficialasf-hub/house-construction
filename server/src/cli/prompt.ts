// Reading a secret for a server CLI. Secrets come from a prompt (or one line of piped stdin), never
// from arguments or the environment, so they don't land in shell history, `ps` or an env file.
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

/** A refusal a CLI shows to the operator as is. */
export class CliError extends Error {
  override name = 'CliError';
}

/**
 * Reads one secret: hidden on a terminal (asked twice when `confirm` is set), the first line of
 * piped stdin otherwise. Throws a CliError when stdin ends without a line or the two answers differ.
 */
export async function readSecret(label: string, { confirm = false }: { confirm?: boolean } = {}): Promise<string> {
  if (!process.stdin.isTTY) {
    const rl = createInterface({ input: process.stdin, terminal: false });
    for await (const line of rl) {
      rl.close();
      return line;
    }
    throw new CliError(`no ${label.toLowerCase()} given on stdin`);
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
    const secret = await ask(`${label}: `);
    if (confirm && (await ask(`Repeat ${label.toLowerCase()}: `)) !== secret) {
      throw new CliError(`the ${label.toLowerCase()}s do not match`);
    }
    return secret;
  } finally {
    rl.close();
  }
}
