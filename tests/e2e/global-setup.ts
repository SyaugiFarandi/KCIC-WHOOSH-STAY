import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const rootDir = resolve(__dirname, '../..');

export default function globalSetup(): void {
  config({ path: resolve(rootDir, '.env.e2e') });
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.includes('whoosh_stay_e2e')) {
    throw new Error(
      'E2E tests must run against the dedicated fixture database (whoosh_stay_e2e) via .env.e2e.',
    );
  }
  const apiDir = resolve(rootDir, 'apps/api');
  execFileSync(
    process.execPath,
    [resolve(apiDir, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: apiDir, env: process.env, stdio: 'inherit' },
  );
  execFileSync(
    process.execPath,
    [resolve(rootDir, 'node_modules/tsx/dist/cli.mjs'), 'src/database/seed-cli.ts'],
    { cwd: apiDir, env: process.env, stdio: 'inherit' },
  );
}