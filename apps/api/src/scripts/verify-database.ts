import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

async function main(): Promise<void> {
  const checks: Check[] = [];

  const tables = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  const tableCount = Number(tables[0]?.count ?? 0);
  checks.push({ name: 'tables', ok: tableCount >= 39, detail: `${tableCount} base tables` });

  const extension = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM pg_extension WHERE extname = 'btree_gist'
  `;
  checks.push({
    name: 'btree_gist',
    ok: Number(extension[0]?.count ?? 0) === 1,
    detail: 'required for bed allocation exclusion',
  });

  const exclusion = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM pg_constraint
    WHERE conname = 'bed_allocations_no_overlap' AND contype = 'x'
  `;
  checks.push({
    name: 'bed_allocations_no_overlap',
    ok: Number(exclusion[0]?.count ?? 0) === 1,
    detail: 'EXCLUDE USING gist on held/active allocations',
  });

  const trigger = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count FROM pg_trigger WHERE tgname = 'audit_logs_immutable'
  `;
  checks.push({
    name: 'audit_logs_immutable',
    ok: Number(trigger[0]?.count ?? 0) === 1,
    detail: 'audit log update/delete blocked',
  });

  const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN ('qr_tokens_one_active_per_occupant', 'reservations_idempotency_unique', 'user_roles_unique_assignment')
  `;
  checks.push({
    name: 'partial_unique_indexes',
    ok: indexes.length === 3,
    detail: indexes.map((row) => row.indexname).join(', ') || 'none',
  });

  const migrations = await prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
  `;
  checks.push({
    name: 'migrations',
    ok: migrations.length >= 1,
    detail: migrations.map((row) => row.migration_name).join(', ') || 'none applied',
  });

  const roles = await prisma.role.count();
  const permissions = await prisma.permission.count();
  const users = await prisma.user.count();
  checks.push({
    name: 'seed',
    ok: roles === 8 && permissions > 0 && users > 0,
    detail: `roles=${roles} permissions=${permissions} users=${users}`,
  });

  let failed = false;
  for (const check of checks) {
    console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.name}: ${check.detail}`);
    if (!check.ok) failed = true;
  }

  if (failed) {
    process.exitCode = 1;
    console.error('[db:verify] database verification failed');
  } else {
    console.log('[db:verify] all checks passed');
  }
}

main()
  .catch((error) => {
    console.error('[db:verify] error', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
