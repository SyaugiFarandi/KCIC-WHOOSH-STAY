import { execSync } from 'node:child_process';

export default function globalSetup(): void {
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (!databaseUrl.includes('whoosh_stay_test')) {
    throw new Error(
      'Integration tests must run against the dedicated test database (whoosh_stay_test). ' +
        'Use the dotenv-cli wrapper with .env.test.',
    );
  }
  execSync('npx prisma migrate deploy', { stdio: 'inherit', env: process.env });
  execSync('npx tsx src/database/seed-cli.ts', { stdio: 'inherit', env: process.env });
}
