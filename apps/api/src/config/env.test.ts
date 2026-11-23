import { afterEach, describe, expect, it, vi } from 'vitest';

const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'production',
  AUTH_MODE: 'oidc',
  OIDC_ISSUER: 'https://issuer.example.test',
  OIDC_CLIENT_ID: 'whoosh-stay',
  OIDC_CLIENT_SECRET: 'secret',
  OIDC_REDIRECT_URI: 'https://stay.example.test/api/v1/auth/callback',
  SESSION_SECRET: 'a-strong-production-session-secret-0123456789',
  SEED_DEMO: 'false',
  EMPLOYEE_SYNC_ENABLED: 'false',
  ROSTER_SYNC_ENABLED: 'false',
  DATABASE_URL: 'postgresql://whoosh:whoosh_dev_password@localhost:5433/whoosh_stay_test',
  WEB_ORIGIN: 'https://stay.example.test',
  MINIO_ACCESS_KEY: 'prod-minio-access',
  MINIO_SECRET_KEY: 'prod-minio-secret',
};

const touchedKeys = new Set<string>(Object.keys(BASE_ENV));

async function importEnv(overrides: Record<string, string | undefined> = {}) {
  vi.resetModules();
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(overrides)) {
    touchedKeys.add(key);
    previous.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await import('./env.js');
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

afterEach(() => {
  touchedKeys.clear();
  vi.resetModules();
});

describe('environment configuration', () => {
  it('accepts a safe production configuration', async () => {
    const loaded = await importEnv(BASE_ENV);
    expect(loaded.env.NODE_ENV).toBe('production');
    expect(loaded.env.AUTH_MODE).toBe('oidc');
    expect(loaded.env.SEED_DEMO).toBe(false);
  });

  it('rejects mock authentication in production', async () => {
    await expect(importEnv({ ...BASE_ENV, AUTH_MODE: 'mock' })).rejects.toThrow(
      /AUTH_MODE must be oidc/,
    );
  });

  it('rejects missing OIDC settings in production', async () => {
    await expect(importEnv({ ...BASE_ENV, OIDC_ISSUER: undefined })).rejects.toThrow(
      /OIDC_ISSUER is required/,
    );
  });

  it('rejects demo seeding in production', async () => {
    await expect(importEnv({ ...BASE_ENV, SEED_DEMO: 'true' })).rejects.toThrow(
      /SEED_DEMO must be false/,
    );
  });

  it('rejects employee integration flags in production', async () => {
    await expect(importEnv({ ...BASE_ENV, EMPLOYEE_SYNC_ENABLED: '1' })).rejects.toThrow(
      /EMPLOYEE_SYNC_ENABLED must remain off/,
    );
  });

  it('rejects default MinIO credentials in production', async () => {
    await expect(
      importEnv({ ...BASE_ENV, MINIO_ACCESS_KEY: undefined, MINIO_SECRET_KEY: undefined }),
    ).rejects.toThrow(/MINIO_ACCESS_KEY\/MINIO_SECRET_KEY must not use the development defaults/);
  });

  it('rejects a short session secret', async () => {
    await expect(
      importEnv({ ...BASE_ENV, SESSION_SECRET: 'too-short', NODE_ENV: 'test' }),
    ).rejects.toThrow(/SESSION_SECRET must be at least 32 characters/);
  });

  it('rejects an unknown auth mode', async () => {
    await expect(importEnv({ ...BASE_ENV, AUTH_MODE: 'basic' })).rejects.toThrow(
      /Invalid environment configuration/,
    );
  });

  it('accepts password authentication in production without OIDC settings', async () => {
    const loaded = await importEnv({
      ...BASE_ENV,
      AUTH_MODE: 'password',
      OIDC_ISSUER: undefined,
      OIDC_CLIENT_ID: undefined,
      OIDC_REDIRECT_URI: undefined,
    });
    expect(loaded.env.AUTH_MODE).toBe('password');
    expect(loaded.env.NODE_ENV).toBe('production');
  });

  it('defaults all external delivery and sync adapters to off', async () => {
    const loaded = await importEnv({
      ...BASE_ENV,
      NODE_ENV: 'test',
      AUTH_MODE: 'mock',
      EMAIL_PROVIDER: undefined,
      SMTP_HOST: undefined,
      SMTP_FROM: undefined,
      TELEGRAM_BOT_TOKEN: undefined,
      EMPLOYEE_SYNC_ENABLED: undefined,
      EMPLOYEE_SYNC_BASE_URL: undefined,
    });
    expect(loaded.env.EMAIL_PROVIDER).toBe('mock');
    expect(loaded.env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(loaded.env.EMPLOYEE_SYNC_ENABLED).toBe(false);
  });

  it('rejects SMTP without host and sender', async () => {
    await expect(
      importEnv({
        ...BASE_ENV,
        NODE_ENV: 'test',
        AUTH_MODE: 'mock',
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: undefined,
        SMTP_FROM: undefined,
      }),
    ).rejects.toThrow(/SMTP_HOST is required/);
  });

  it('rejects an SMTP user without a password', async () => {
    await expect(
      importEnv({
        ...BASE_ENV,
        NODE_ENV: 'test',
        AUTH_MODE: 'mock',
        EMAIL_PROVIDER: 'smtp',
        SMTP_HOST: 'smtp.example.test',
        SMTP_FROM: 'noreply@example.test',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: undefined,
      }),
    ).rejects.toThrow(/SMTP_PASSWORD is required/);
  });

  it('accepts a complete SMTP configuration', async () => {
    const loaded = await importEnv({
      ...BASE_ENV,
      NODE_ENV: 'test',
      AUTH_MODE: 'mock',
      EMAIL_PROVIDER: 'smtp',
      SMTP_HOST: 'smtp.example.test',
      SMTP_FROM: 'noreply@example.test',
      SMTP_USER: 'mailer',
      SMTP_PASSWORD: 'smtp-secret',
    });
    expect(loaded.env.EMAIL_PROVIDER).toBe('smtp');
    expect(loaded.env.SMTP_PORT).toBe(587);
  });

  it('rejects employee sync without a base URL', async () => {
    await expect(
      importEnv({
        ...BASE_ENV,
        NODE_ENV: 'test',
        AUTH_MODE: 'mock',
        EMPLOYEE_SYNC_ENABLED: 'true',
        EMPLOYEE_SYNC_BASE_URL: undefined,
        EMPLOYEE_SYNC_TOKEN: 'token',
      }),
    ).rejects.toThrow(/EMPLOYEE_SYNC_BASE_URL is required/);
  });

  it('rejects bearer employee sync without a token', async () => {
    await expect(
      importEnv({
        ...BASE_ENV,
        NODE_ENV: 'test',
        AUTH_MODE: 'mock',
        EMPLOYEE_SYNC_ENABLED: 'true',
        EMPLOYEE_SYNC_BASE_URL: 'https://hr.example.test/api',
        EMPLOYEE_SYNC_AUTH_TYPE: 'bearer',
        EMPLOYEE_SYNC_TOKEN: undefined,
      }),
    ).rejects.toThrow(/EMPLOYEE_SYNC_TOKEN is required/);
  });

  it('accepts an API-key employee sync configuration outside production', async () => {
    const loaded = await importEnv({
      ...BASE_ENV,
      NODE_ENV: 'test',
      AUTH_MODE: 'mock',
      EMPLOYEE_SYNC_ENABLED: 'true',
      EMPLOYEE_SYNC_BASE_URL: 'https://hr.example.test/api',
      EMPLOYEE_SYNC_AUTH_TYPE: 'api-key',
      EMPLOYEE_SYNC_TOKEN: 'hr-key',
      EMPLOYEE_SYNC_API_KEY_HEADER: 'x-hr-key',
    });
    expect(loaded.env.EMPLOYEE_SYNC_ENABLED).toBe(true);
    expect(loaded.env.EMPLOYEE_SYNC_AUTH_TYPE).toBe('api-key');
  });
});
