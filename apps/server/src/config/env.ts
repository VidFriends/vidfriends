// Environment configuration (TDD §3, NFR-OPS-02, NFR-SEC-03).
// Env holds infrastructure: URLs, secrets, ports, concurrency. Product policy lives in instance settings.
// Durations carry their unit in the key name (L-07). `deploy/ENV.md` is generated from this file.
import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');
const int = (min: number, max: number) => z.coerce.number().int().min(min).max(max);

interface EnvEntry {
  schema: z.ZodType;
  description: string;
  secret?: boolean;
  example?: string;
}

export const ENV_SPEC = {
  NODE_ENV: {
    schema: z.enum(['development', 'test', 'production']).default('development'),
    description: '`production` enables the secret strength checks (NFR-SEC-03).',
  },
  ROLE: {
    schema: z.enum(['api', 'worker', 'all']).default('all'),
    description:
      'Process role: `api` (HTTP + web app), `worker` (background jobs) or `all` (both, for small installs). `node dist/main.js migrate` applies migrations and exits.',
  },
  HOST: { schema: z.string().default('0.0.0.0'), description: 'HTTP bind address.' },
  PORT: { schema: int(1, 65535).default(8080), description: 'HTTP port.' },
  METRICS_PORT: {
    schema: int(0, 65535).default(9464),
    description: 'Internal Prometheus `/metrics` port (0 disables). Never publish it.',
  },
  PUBLIC_URL: {
    schema: z.url().transform((u) => u.replace(/\/+$/, '')),
    description:
      'Public origin of the instance, e.g. `https://vf.example.org`. Used for join links, CSRF origin checks and cookie security.',
    example: 'https://vf.example.org',
  },
  DATABASE_URL: {
    schema: z.string().startsWith('postgres'),
    description: 'PostgreSQL connection string.',
    secret: true,
    example: 'postgres://vidfriends:<password>@postgres:5432/vidfriends',
  },
  APP_SECRET: {
    schema: z.string().min(1),
    description:
      'At least 32 random characters. Used for CSRF tokens and to encrypt instance secrets (VAPID key) at rest. Generate with `openssl rand -base64 48`.',
    secret: true,
  },
  TRUSTED_PROXIES: {
    schema: z
      .string()
      .default('127.0.0.1/32,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7')
      .transform((s) =>
        s
          .split(',')
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    description:
      'Comma-separated CIDRs of reverse proxies whose `X-Forwarded-For` is trusted (L-20). Default: loopback and private ranges (the compose network).',
  },
  LOG_LEVEL: {
    schema: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    description: 'pino log level.',
  },
  WEB_DIST: {
    schema: z.string().default(''),
    description:
      'Directory with the built web app (served at `/`). Empty means `../web/dist` relative to the server package.',
  },
  SHUTDOWN_GRACE_SECONDS: {
    schema: int(1, 120).default(15),
    description: 'Maximum time to finish in-flight requests on SIGTERM (NFR-REL-02).',
  },
  RATE_LIMIT_AUTH_PER_MINUTE: {
    schema: int(1, 100000).default(10),
    description: 'Auth endpoint requests per minute, per client IP and per username (NFR-SEC-06).',
  },
  RATE_LIMIT_USER_PER_MINUTE: {
    schema: int(1, 100000).default(300),
    description: 'Authenticated requests per minute per user (NFR-SEC-06).',
  },
  RATE_LIMIT_IP_PER_MINUTE: {
    schema: int(1, 100000).default(1200),
    description: 'All requests per minute per client IP.',
  },
  S3_ENDPOINT: {
    schema: z.url().optional(),
    description:
      'Internal S3 API endpoint used by the server and worker, e.g. `http://seaweedfs:8333`. Empty for AWS S3.',
    example: 'http://seaweedfs:8333',
  },
  S3_PUBLIC_ENDPOINT: {
    schema: z.url().optional(),
    description:
      'Endpoint used in presigned URLs given to clients, e.g. `https://vf.example.org/media-store`. Defaults to `S3_ENDPOINT`.',
    example: 'https://vf.example.org/media-store',
  },
  S3_REGION: { schema: z.string().default('us-east-1'), description: 'S3 region.' },
  S3_BUCKET: { schema: z.string().default('vidfriends'), description: 'Private bucket name.' },
  S3_ACCESS_KEY_ID: {
    schema: z.string().default(''),
    description: 'S3 access key id.',
    secret: true,
  },
  S3_SECRET_ACCESS_KEY: {
    schema: z.string().default(''),
    description: 'S3 secret access key.',
    secret: true,
  },
  S3_FORCE_PATH_STYLE: {
    schema: bool.default(true),
    description: 'Use path-style S3 URLs (required for SeaweedFS and MinIO).',
  },
  WORK_DIR: {
    schema: z.string().default('/tmp/vidfriends-work'),
    description: 'Disk-backed directory for per-job temporary files (worker).',
  },
  WORKER_FETCH_CONCURRENCY: {
    schema: int(1, 16).default(2),
    description: 'Concurrent `video.fetch` jobs (NFR-PERF-03).',
  },
  WORKER_PROCESS_CONCURRENCY: {
    schema: int(1, 8).default(1),
    description: 'Concurrent `video.process` (transcode) jobs (NFR-PERF-03).',
  },
  YTDLP_PATH: { schema: z.string().default('yt-dlp'), description: 'yt-dlp executable.' },
  FFMPEG_PATH: { schema: z.string().default('ffmpeg'), description: 'ffmpeg executable.' },
  FFPROBE_PATH: { schema: z.string().default('ffprobe'), description: 'ffprobe executable.' },
  FETCH_TIMEOUT_SECONDS: {
    schema: int(10, 3600).default(600),
    description: 'Wall-clock limit for one yt-dlp run.',
  },
  EXPO_PUSH_ENABLED: {
    schema: bool.default(true),
    description: 'Send mobile push through the Expo push service (ADR-0011). Set false to opt out.',
  },
} satisfies Record<string, EnvEntry>;

type Spec = typeof ENV_SPEC;
export type Env = { [K in keyof Spec]: z.output<Spec[K]['schema']> };

const envSchema = z.object(
  Object.fromEntries(Object.entries(ENV_SPEC).map(([k, v]) => [k, v.schema])) as {
    [K in keyof Spec]: Spec[K]['schema'];
  },
);

/** Values that must never be used as secrets in production (L-06). */
const KNOWN_WEAK = new Set(
  [
    'changeme',
    'change-me',
    'changethis',
    'secret',
    'password',
    'postgres',
    'vidfriends',
    'minioadmin',
    'admin',
    'test',
    'example',
    'dev-secret',
    'development',
    'supersecret',
    'your-secret-here',
    'replace-me',
  ].map((s) => s.toLowerCase()),
);

function weak(value: string, minLength: number): string | null {
  if (value.length < minLength) return `must be at least ${minLength} characters`;
  const lower = value.toLowerCase();
  if (KNOWN_WEAK.has(lower) || [...KNOWN_WEAK].some((w) => lower === `${w}${w}`))
    return 'is a known default';
  if (/^(.)\1+$/.test(value)) return 'is a repeated character';
  if (/^<.*>$/.test(value) || lower.includes('changeme') || lower.includes('replace'))
    return 'is a placeholder';
  return null;
}

export class ConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/** Parse and validate the environment. Throws one aggregated ConfigError (NFR-OPS-02). */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // Treat empty strings as unset so `KEY=` in an .env file means "use the default".
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = envSchema.safeParse(cleaned);
  const problems: string[] = [];
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      problems.push(`${issue.path.join('.') || '(env)'}: ${issue.message}`);
    }
    throw new ConfigError(problems);
  }
  const env = parsed.data as Env;

  if (env.NODE_ENV === 'production') {
    const appSecret = weak(env.APP_SECRET, 32);
    if (appSecret) problems.push(`APP_SECRET ${appSecret}`);
    let dbPassword = '';
    try {
      dbPassword = decodeURIComponent(new URL(env.DATABASE_URL).password);
    } catch {
      problems.push('DATABASE_URL is not a valid URL');
    }
    if (!dbPassword) problems.push('DATABASE_URL must include a password');
    else {
      const p = weak(dbPassword, 12);
      if (p) problems.push(`DATABASE_URL password ${p}`);
    }
    if (!env.S3_ACCESS_KEY_ID) problems.push('S3_ACCESS_KEY_ID is required');
    const s3 = weak(env.S3_SECRET_ACCESS_KEY, 16);
    if (s3) problems.push(`S3_SECRET_ACCESS_KEY ${s3}`);
  } else if (env.APP_SECRET.length < 16) {
    problems.push('APP_SECRET must be at least 16 characters (32 in production)');
  }
  if (problems.length) throw new ConfigError(problems);
  return env;
}
