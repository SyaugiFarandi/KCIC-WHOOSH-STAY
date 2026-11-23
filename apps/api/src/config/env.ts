import { config as loadDotenv } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

for (const candidate of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '../../.env'),
  resolve(process.cwd(), '../../../.env'),
]) {
  if (existsSync(candidate)) {
    loadDotenv({ path: candidate });
    break;
  }
}

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  WEB_ORIGIN: z.url().default('http://localhost:5174'),
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(8),
  AUTH_MODE: z.enum(['mock', 'oidc', 'password']).default('mock'),
  OIDC_ISSUER: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPE: z.string().default('openid profile email'),
  EMPLOYEE_SYNC_ENABLED: booleanish.default(false),
  ROSTER_SYNC_ENABLED: booleanish.default(false),
  EMPLOYEE_SYNC_BASE_URL: z.url().optional(),
  EMPLOYEE_SYNC_PATH: z.string().default('/employees'),
  EMPLOYEE_SYNC_SOURCE_SYSTEM: z.string().min(1).default('EXTERNAL_HR'),
  EMPLOYEE_SYNC_AUTH_TYPE: z.enum(['none', 'bearer', 'api-key', 'basic']).default('bearer'),
  EMPLOYEE_SYNC_TOKEN: z.string().optional(),
  EMPLOYEE_SYNC_API_KEY_HEADER: z.string().default('x-api-key'),
  EMPLOYEE_SYNC_USERNAME: z.string().optional(),
  EMPLOYEE_SYNC_PASSWORD: z.string().optional(),
  EMPLOYEE_SYNC_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(15_000),
  EMAIL_PROVIDER: z.enum(['mock', 'smtp']).default('mock'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(587),
  SMTP_SECURE: booleanish.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().optional(),
  SMTP_REPLY_TO: z.string().optional(),
  SMTP_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_API_BASE_URL: z.url().default('https://api.telegram.org'),
  TELEGRAM_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(10_000),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9100),
  MINIO_USE_SSL: booleanish.default(false),
  MINIO_ACCESS_KEY: z.string().default('whoosh_minio'),
  MINIO_SECRET_KEY: z.string().default('whoosh_minio_password'),
  MINIO_BUCKET_ASSETS: z.string().default('whoosh-stay-assets'),
  MINIO_BUCKET_EVIDENCE: z.string().default('whoosh-stay-evidence'),
  ATTACHMENT_MAX_BYTES: z.coerce.number().int().min(1024).max(25 * 1024 * 1024).default(5 * 1024 * 1024),
  GALLERY_PHOTO_MAX_BYTES: z.coerce.number().int().min(1024).max(30 * 1024 * 1024).default(12 * 1024 * 1024),
  SEED_DEMO: booleanish.default(true),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(120),
  API_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(600),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  TRUST_PROXY: booleanish.default(false),
});

export type AppEnv = z.infer<typeof envSchema>;

function loadEnv(): AppEnv {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || 'env'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Invalid environment configuration: ${issues}`);
  }

  const value = parsed.data;

  if (value.NODE_ENV === 'production') {
    const problems: string[] = [];
    if (value.AUTH_MODE === 'mock') problems.push('AUTH_MODE must be oidc or password in production');
    if (value.AUTH_MODE === 'oidc') {
      if (!value.OIDC_ISSUER) problems.push('OIDC_ISSUER is required in production');
      if (!value.OIDC_CLIENT_ID) problems.push('OIDC_CLIENT_ID is required in production');
      if (!value.OIDC_REDIRECT_URI) problems.push('OIDC_REDIRECT_URI is required in production');
    }
    if (value.SESSION_SECRET.toLowerCase().includes('dev-only')) {
      problems.push('SESSION_SECRET must not use the development default');
    }
    if (value.SEED_DEMO) problems.push('SEED_DEMO must be false in production');
    if (value.EMPLOYEE_SYNC_ENABLED) {
      problems.push('EMPLOYEE_SYNC_ENABLED must remain off until the official API contract is approved');
    }
    if (value.ROSTER_SYNC_ENABLED) {
      problems.push('ROSTER_SYNC_ENABLED must remain off until the official API contract is approved');
    }
    if (value.MINIO_ACCESS_KEY === 'whoosh_minio' || value.MINIO_SECRET_KEY === 'whoosh_minio_password') {
      problems.push('MINIO_ACCESS_KEY/MINIO_SECRET_KEY must not use the development defaults');
    }
    if (problems.length > 0) {
      throw new Error(`Unsafe production configuration: ${problems.join('; ')}`);
    }
  }

  if (value.EMAIL_PROVIDER === 'smtp') {
    const smtpProblems: string[] = [];
    if (!value.SMTP_HOST) smtpProblems.push('SMTP_HOST is required when EMAIL_PROVIDER=smtp');
    if (!value.SMTP_FROM) smtpProblems.push('SMTP_FROM is required when EMAIL_PROVIDER=smtp');
    if (value.SMTP_USER && !value.SMTP_PASSWORD) {
      smtpProblems.push('SMTP_PASSWORD is required when SMTP_USER is set');
    }
    if (smtpProblems.length > 0) {
      throw new Error(`Invalid email provider configuration: ${smtpProblems.join('; ')}`);
    }
  }

  if (value.EMPLOYEE_SYNC_ENABLED) {
    const syncProblems: string[] = [];
    if (!value.EMPLOYEE_SYNC_BASE_URL) {
      syncProblems.push('EMPLOYEE_SYNC_BASE_URL is required when EMPLOYEE_SYNC_ENABLED=true');
    }
    if (value.EMPLOYEE_SYNC_AUTH_TYPE === 'bearer' && !value.EMPLOYEE_SYNC_TOKEN) {
      syncProblems.push('EMPLOYEE_SYNC_TOKEN is required for auth type bearer');
    }
    if (
      value.EMPLOYEE_SYNC_AUTH_TYPE === 'basic' &&
      (!value.EMPLOYEE_SYNC_USERNAME || !value.EMPLOYEE_SYNC_PASSWORD)
    ) {
      syncProblems.push('EMPLOYEE_SYNC_USERNAME and EMPLOYEE_SYNC_PASSWORD are required for auth type basic');
    }
    if (value.EMPLOYEE_SYNC_AUTH_TYPE === 'api-key' && !value.EMPLOYEE_SYNC_TOKEN) {
      syncProblems.push('EMPLOYEE_SYNC_TOKEN is required for auth type api-key');
    }
    if (syncProblems.length > 0) {
      throw new Error(`Invalid employee sync configuration: ${syncProblems.join('; ')}`);
    }
  }

  return value;
}

export const env = loadEnv();
