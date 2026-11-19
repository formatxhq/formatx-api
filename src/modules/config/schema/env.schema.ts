import { randomBytes } from 'node:crypto';
import { z } from 'zod';

/** "true" / "false" from the environment, as a boolean. */
const booleanFlag = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true')
  .optional();

/** "a, b, c" from the environment, as ['a', 'b', 'c']. */
const commaSeparatedList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

/**
 * Every setting the API reads, validated once at startup.
 * A bad or missing value stops the process with a message naming the variable,
 * instead of failing later in the middle of a request.
 */
export const envSchema = z
  .object({
    // ---- server ----
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(8080),
    /** Where the API is reachable. App-signed upload/download URLs (local storage) are built from it. */
    PUBLIC_API_URL: z.url().default('http://localhost:8080'),
    /** Browser origins allowed to call the API. */
    CORS_ORIGINS: commaSeparatedList.default(['http://localhost:4200']),

    // ---- database ----
    /** Postgres connection string. Unset in development and tests: an embedded PGlite database. */
    DATABASE_URL: z.string().min(1).optional(),
    /** Folder PGlite keeps its data in. Unset: in memory, gone when the process exits. */
    PGLITE_DIR: z.string().min(1).optional(),
    /** Apply migrations at startup on Postgres. Production does it as a separate release step instead. */
    DB_MIGRATE_ON_START: booleanFlag,

    // ---- file storage ----
    /** s3 = Cloudflare R2 (production) · local = a folder (development) · memory = tests. */
    STORAGE_DRIVER: z.enum(['s3', 'local', 'memory']).default('local'),
    STORAGE_LOCAL_ROOT: z.string().min(1).default('.data/files'),
    /** Signs upload/download URLs the API serves itself (local and memory drivers). */
    STORAGE_SIGNING_KEY: z.string().min(32).optional(),
    /** R2: https://<account id>.r2.cloudflarestorage.com */
    S3_ENDPOINT: z.url().optional(),
    S3_REGION: z.string().min(1).default('auto'),
    S3_BUCKET: z.string().min(1).optional(),
    S3_ACCESS_KEY_ID: z.string().min(1).optional(),
    S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
    S3_FORCE_PATH_STYLE: booleanFlag,

    // ---- files ----
    /** How long an anonymous file lives before cleanup deletes it. */
    ANON_FILE_TTL_SECONDS: z.coerce.number().int().min(60).default(3600),
    /** Largest upload accepted, in bytes (decimal megabytes, the way job portals count them). */
    MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(50_000_000),

    // ---- cleanup ----
    /** Bearer secret for /internal routes, which the Cloudflare cron Worker calls. */
    INTERNAL_SECRET: z.string().min(32).optional(),
    /** Run cleanup in-process every N seconds. Development only; production uses the cron Worker. */
    CLEANUP_INTERVAL_SECONDS: z.coerce.number().int().min(10).optional(),
  })
  .superRefine((env, ctx) => {
    const required = (key: keyof typeof env, when: string) => {
      if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `required ${when}` });
    };

    if (env.NODE_ENV === 'production') {
      required('DATABASE_URL', 'in production');
      required('INTERNAL_SECRET', 'in production');
      if (env.STORAGE_DRIVER !== 's3') {
        ctx.addIssue({ code: 'custom', path: ['STORAGE_DRIVER'], message: 'must be s3 in production' });
      }
    }
    if (env.STORAGE_DRIVER === 's3') {
      required('S3_BUCKET', 'when STORAGE_DRIVER is s3');
      required('S3_ENDPOINT', 'when STORAGE_DRIVER is s3');
    }
  });

/** The validated settings. `STORAGE_SIGNING_KEY` is always present (generated when not set). */
export type Env = z.output<typeof envSchema> & { STORAGE_SIGNING_KEY: string };

/** Parses `process.env` (or a test's settings) into a typed, validated `Env`. */
export function loadEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment:\n${problems.join('\n')}`);
  }

  // Outside R2, the API signs its own URLs. A random key per process is fine for development:
  // links simply stop working after a restart.
  const signingKey = result.data.STORAGE_SIGNING_KEY ?? randomBytes(32).toString('hex');
  return { ...result.data, STORAGE_SIGNING_KEY: signingKey };
}
