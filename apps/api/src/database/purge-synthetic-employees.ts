import { prisma } from '../lib/prisma.js';

// Removes ALL synthetic employee profiles (sourceSystem='SYNTHETIC') and their
// unconfirmed internal org references. Dry-run by default; pass --confirm to execute.
// Aborts if any synthetic employee is referenced by operational records — those
// relations must be analyzed manually first; operational data is never deleted.

const databaseUrl = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV === 'production') {
  throw new Error('Purge sintetis tidak boleh dijalankan pada lingkungan production.');
}
if (/whoosh_stay_(test|e2e)/.test(databaseUrl)) {
  throw new Error('Purge sintetis hanya untuk database pengembangan (whoosh_stay).');
}

const SOURCE = 'SYNTHETIC';
const CONFIRM = process.argv.includes('--confirm');

async function main(): Promise<void> {
  const synthetic = await prisma.employee.findMany({
    where: { sourceSystem: SOURCE },
    orderBy: { employeeCode: 'asc' },
    select: { id: true, employeeCode: true },
  });
  if (synthetic.length === 0) {
    console.log('[purge-synthetic] Tidak ada profil sintetis; tidak ada yang dihapus.');
    return;
  }
  const ids = synthetic.map((row) => row.id);

  const [users, reservations, guests, checkins, checkouts, qrTokens, roster, recommendations] =
    await Promise.all([
      prisma.user.count({ where: { employeeId: { in: ids } } }),
      prisma.reservation.count({ where: { primaryEmployeeId: { in: ids } } }),
      prisma.reservationGuest.count({ where: { employeeId: { in: ids } } }),
      prisma.checkinRecord.count({ where: { employeeId: { in: ids } } }),
      prisma.checkoutRecord.count({ where: { employeeId: { in: ids } } }),
      prisma.qrToken.count({ where: { employeeId: { in: ids } } }),
      prisma.rosterAssignment.count({ where: { employeeId: { in: ids } } }),
      prisma.accommodationRecommendation.count({ where: { employeeId: { in: ids } } }),
    ]);
  const blockers = {
    users,
    reservations,
    reservationGuests: guests,
    checkinRecords: checkins,
    checkoutRecords: checkouts,
    qrTokens,
    rosterAssignments: roster,
    accommodationRecommendations: recommendations,
  };
  const blockedTotal = Object.values(blockers).reduce((sum, value) => sum + value, 0);

  console.log(`[purge-synthetic] ${synthetic.length} profil sintetis ditemukan (${synthetic[0].employeeCode} s.d. ${synthetic[synthetic.length - 1].employeeCode}).`);
  if (blockedTotal > 0) {
    console.error('[purge-synthetic] DIBATALKAN: ada relasi operasional ke profil sintetis:');
    for (const [name, count] of Object.entries(blockers)) {
      if (count > 0) console.error(`  - ${name}: ${count}`);
    }
    console.error('[purge-synthetic] Analisis relasi tersebut secara manual sebelum menghapus.');
    process.exitCode = 1;
    return;
  }

  const syntheticRefs = await prisma.orgReference.findMany({
    where: { sourceSystem: SOURCE, status: 'UNCONFIRMED' },
    select: { id: true, type: true, code: true },
  });
  const remaining = await prisma.employee.findMany({
    where: { sourceSystem: { not: SOURCE } },
    select: { departmentCode: true, divisionCode: true, positionCode: true },
  });
  const usedCodes = new Set<string>();
  for (const row of remaining) {
    for (const code of [row.departmentCode, row.divisionCode, row.positionCode]) {
      if (code) usedCodes.add(code);
    }
  }
  const deletableRefs = syntheticRefs.filter((ref) => !usedCodes.has(ref.code));
  const keptRefs = syntheticRefs.filter((ref) => usedCodes.has(ref.code));

  if (!CONFIRM) {
    console.log('[purge-synthetic] DRY-RUN (jalankan dengan --confirm untuk mengeksekusi):');
    console.log(`  - karyawan sintetis yang akan dihapus: ${synthetic.length}`);
    console.log(`  - referensi organisasi UNCONFIRMED yang akan dihapus: ${deletableRefs.length}`);
    if (keptRefs.length > 0) {
      console.log(`  - referensi dipertahankan (dipakai data non-sintetis): ${keptRefs.map((ref) => ref.code).join(', ')}`);
    }
    console.log('  - relasi operasional: 0 (aman)');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      const deletedEmployees = await tx.employee.deleteMany({
        where: { sourceSystem: SOURCE },
      });
      const deletedRefs = await tx.orgReference.deleteMany({
        where: { id: { in: deletableRefs.map((ref) => ref.id) } },
      });
      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_SYNTHETIC_PURGE',
          entityType: 'EMPLOYEE',
          reason: 'Synthetic test profiles removed; official HR data replaces them via import.',
          afterData: {
            employeesDeleted: deletedEmployees.count,
            orgReferencesDeleted: deletedRefs.count,
            orgReferencesKept: keptRefs.map((ref) => ref.code),
          },
        },
      });
      console.log(`[purge-synthetic] ${deletedEmployees.count} karyawan sintetis dan ${deletedRefs.count} referensi organisasi dihapus.`);
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
  if (keptRefs.length > 0) {
    console.log(`[purge-synthetic] Referensi dipertahankan karena dipakai data lain: ${keptRefs.map((ref) => ref.code).join(', ')}`);
  }
  console.log('[purge-synthetic] Audit tercatat: EMPLOYEE_SYNTHETIC_PURGE.');
}

main()
  .catch((error) => {
    console.error('[purge-synthetic] Gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });