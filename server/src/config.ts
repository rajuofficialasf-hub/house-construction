import { z } from 'zod';

// An origin is scheme, host and port only. Anything else (a path, a trailing slash, "*") would
// never match a browser's Origin header, or would match too much.
const origin = z
  .string()
  .trim()
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, 'must be an origin like https://example.org');

// Every setting the API reads from the environment. The process refuses to start when any
// value is missing or malformed (NE-CFG-01).
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Comma-separated browser origins allowed to call the API with the session cookie (NE-SEC-02).
  ALLOWED_ORIGINS: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(origin).min(1)),
  // Secure cookies everywhere except plain-http local development (NE-SEC-05).
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
});

export type Config = z.infer<typeof configSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Parses the environment. Throws a ConfigError listing each bad setting by name, never its value. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid server configuration:\n  ${problems.join('\n  ')}`);
  }
  return result.data;
}
