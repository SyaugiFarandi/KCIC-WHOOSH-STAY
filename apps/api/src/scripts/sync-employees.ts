import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

const { prisma } = await import('../lib/prisma.js');
const { syncEmployees } = await import('../modules/employees/service.js');

try {
  const summary = await syncEmployees();
  console.log(
    `[employees:sync] run=${summary.runId} status=${summary.status} fetched=${summary.fetched} inserted=${summary.inserted} updated=${summary.updated} failed=${summary.failed}`,
  );
} catch (error) {
  console.error('[employees:sync] failed', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
