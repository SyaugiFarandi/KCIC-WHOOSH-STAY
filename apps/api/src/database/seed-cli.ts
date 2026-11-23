import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { seedDatabase } from './seed.js';
import { seedDemoPhotos } from './demo-photos.js';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

async function main(): Promise<void> {
  const production = process.env.NODE_ENV === 'production';
  const demo = process.env.SEED_DEMO === 'true';
  if (production && demo) {
    throw new Error('SEED_DEMO tidak boleh aktif saat NODE_ENV=production.');
  }
  const summary = await seedDatabase(prisma, { demo });
  console.log(
    `[seed] permissions=${summary.permissions} roles=${summary.roles} rolePermissions=${summary.rolePermissions} users=${summary.users} employees=${summary.employees} dormitories=${summary.dormitories} rooms=${summary.rooms} beds=${summary.beds} demo=${demo}`,
  );
  if (demo) {
    try {
      const photos = await seedDemoPhotos(prisma);
      console.log(
        `[seed] demoPhotos=${photos.photos}${photos.skipped ? ' (already seeded)' : ''}`,
      );
    } catch (error) {
      console.warn('[seed] demo photo seeding skipped:', error);
    }
  }
}

main()
  .catch((error) => {
    console.error('[seed] failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
