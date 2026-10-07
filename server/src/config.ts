import { z } from 'zod';

// An origin is scheme, host and port only. Anything else (a path, a trailing slash, "*") would
// never match a browser's Origin header, or would match too much.
const origin = z
  .string()
  .trim()
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, 'must be an origin like https://example.org');

// The API's own public base URL, which stored photo URLs are built from (docs/api/PROJECTS_API_CONTRACT.md §3.4).
// Scheme, host, optional path; no trailing slash, query or fragment, so `${url}/api/v1/…` is always right.
export const baseUrl = z
  .string()
  .trim()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !value.endsWith('/') && !url.search && !url.hash;
  }, 'must be an http(s) URL with no trailing slash, like https://api.example.org');

// Every setting the API reads from the environment. The process refuses to start when any
// value is missing or malformed (NE-CFG-01).
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Loopback by default, so on a server only the local nginx can reach the API and every
  // X-Forwarded-For it sees came from that proxy (NE-SEC-10). Docker sets 0.0.0.0.
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  // Comma-separated browser origins allowed to call the API with the session cookie (NE-SEC-02).
  ALLOWED_ORIGINS: z
    .string()
    .transform((value) => value.split(','))
    .pipe(z.array(origin).min(1)),
  // Comma-separated origins of other apps that may make uncredentialed GETs to the public reads
  // (docs/api/PROJECTS_API_CONTRACT.md §1.3). They never get the cookie or any write. Empty by default.
  PUBLIC_READ_ORIGINS: z
    .string()
    .default('')
    .transform((value) => (value.trim() === '' ? [] : value.split(',')))
    .pipe(z.array(origin)),
  // Secure cookies everywhere except plain-http local development (NE-SEC-05).
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  PUBLIC_API_URL: baseUrl,
  // Public reads allowed per IP per minute, when the default (DEFAULT_READ_RATE_LIMIT) is too low:
  // the Playwright admin-rest server, where one test run is one IP. Production leaves it unset.
  READ_RATE_LIMIT: z.coerce.number().int().min(1).optional(),
}).superRefine((config, ctx) => {
  // One role per origin, so nobody has to work out which list wins.
  for (const value of config.PUBLIC_READ_ORIGINS) {
    if (config.ALLOWED_ORIGINS.includes(value)) {
      ctx.addIssue({ code: 'custom', path: ['PUBLIC_READ_ORIGINS'], message: `${value} is also in ALLOWED_ORIGINS` });
    }
  }
});

// Which storage driver holds the photos, and only that driver's settings (NS-34). No default: a
// deployment must say where its files live. S3 credentials are not settings here; the AWS SDK reads
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY or the host's IAM role (NS-43).
export const storageSchema = z.discriminatedUnion('STORAGE_DRIVER', [
  z.object({ STORAGE_DRIVER: z.literal('nas'), STORAGE_ROOT: z.string().trim().min(1) }),
  // TEMP: S3 is a stopgap until the NAS is ready; remove this branch with drivers/s3.ts.
  z.object({
    STORAGE_DRIVER: z.literal('s3'),
    S3_BUCKET: z.string().trim().min(1),
    S3_REGION: z.string().trim().min(1),
    S3_ENDPOINT: z.url({ protocol: /^https?$/ }).optional(),
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  }),
]);

export type StorageConfig = z.infer<typeof storageSchema>;
export type Config = z.infer<typeof configSchema> & StorageConfig;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Parses the environment. Throws a ConfigError listing each bad setting by name, never its value. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const base = configSchema.safeParse(env);
  const storage = storageSchema.safeParse(env);
  const issues = [...(base.error?.issues ?? []), ...(storage.error?.issues ?? [])];
  if (!base.success || !storage.success) {
    const problems = issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid server configuration:\n  ${problems.join('\n  ')}`);
  }
  return { ...base.data, ...storage.data };
}
