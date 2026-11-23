import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { prisma } from '../lib/prisma.js';
import { removeObject, STORAGE_BUCKETS } from '../lib/storage.js';

for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
  if (existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
}

const DEMO_EMAIL_SUFFIX = '@demo.whoosh-stay.local';

async function main(): Promise<void> {
  const execute = process.argv.includes('--execute');
  const databaseUrl = process.env.DATABASE_URL ?? '';
  if (databaseUrl.includes('whoosh_stay_test') || databaseUrl.includes('whoosh_stay_e2e')) {
    throw new Error('Purge demo tidak boleh dijalankan pada database test/E2E (fixture).');
  }

  const demoUserIds = (
    await prisma.user.findMany({
      where: { email: { endsWith: DEMO_EMAIL_SUFFIX } },
      select: { id: true },
    })
  ).map((row) => row.id);
  const demoEmployeeIds = (
    await prisma.employee.findMany({ where: { sourceSystem: 'DEMO' }, select: { id: true } })
  ).map((row) => row.id);
  const demoDormIds = (
    await prisma.dormitory.findMany({
      where: { code: { startsWith: 'DEMO-' } },
      select: { id: true },
    })
  ).map((row) => row.id);
  const demoBuildingIds = (
    await prisma.building.findMany({
      where: { dormitoryId: { in: demoDormIds } },
      select: { id: true },
    })
  ).map((row) => row.id);
  const demoFloorIds = (
    await prisma.floor.findMany({
      where: { buildingId: { in: demoBuildingIds } },
      select: { id: true },
    })
  ).map((row) => row.id);
  const demoRoomIds = (
    await prisma.room.findMany({ where: { floorId: { in: demoFloorIds } }, select: { id: true } })
  ).map((row) => row.id);
  const demoBedIds = (
    await prisma.bed.findMany({ where: { roomId: { in: demoRoomIds } }, select: { id: true } })
  ).map((row) => row.id);

  const foreign = {
    users: await prisma.user.count({
      where: { email: { not: { endsWith: DEMO_EMAIL_SUFFIX } } },
    }),
    employees: await prisma.employee.count({ where: { sourceSystem: { not: 'DEMO' } } }),
    dormitories: await prisma.dormitory.count({
      where: { code: { not: { startsWith: 'DEMO-' } } },
    }),
    rooms: await prisma.room.count({ where: { id: { notIn: demoRoomIds } } }),
    beds: await prisma.bed.count({ where: { id: { notIn: demoBedIds } } }),
    reservations: await prisma.reservation.count({
      where: {
        bookingCode: { not: { startsWith: 'DEMO-' } },
        OR: [{ createdBy: null }, { createdBy: { notIn: demoUserIds } }],
      },
    }),
    attachments: await prisma.attachment.count({
      where: { uploadedBy: { notIn: demoUserIds } },
    }),
    inventoryBlocks: await prisma.inventoryBlock.count({
      where: { createdBy: { notIn: demoUserIds } },
    }),
    maintenanceTickets: await prisma.maintenanceTicket.count({
      where: { reportedBy: { notIn: demoUserIds } },
    }),
    notifications: await prisma.notification.count({
      where: { userId: { notIn: demoUserIds } },
    }),
    photos: await prisma.accommodationPhoto.count({
      where: { dormitoryId: { notIn: demoDormIds } },
    }),
    rosterAssignments: await prisma.rosterAssignment.count({
      where: { employeeId: { notIn: demoEmployeeIds } },
    }),
    recommendations: await prisma.accommodationRecommendation.count({
      where: { employeeId: { notIn: demoEmployeeIds } },
    }),
  };
  const foreignEntries = Object.entries(foreign).filter(([, count]) => count > 0);
  if (foreignEntries.length > 0) {
    console.error('[purge] DIBATALKAN — ditemukan data non-demo / asal-usul belum diverifikasi:');
    for (const [table, count] of foreignEntries) console.error(`  ${table}: ${count}`);
    console.error('[purge] Audit dan pindahkan data tersebut terlebih dahulu; jangan hapus membabi buta.');
    process.exitCode = 1;
    return;
  }

  const counts = {
    recommendations: await prisma.accommodationRecommendation.count(),
    bedAllocations: await prisma.bedAllocation.count(),
    reservations: await prisma.reservation.count(),
    housekeepingTasks: await prisma.housekeepingTask.count(),
    maintenanceTickets: await prisma.maintenanceTicket.count(),
    inventoryBlocks: await prisma.inventoryBlock.count(),
    attachments: await prisma.attachment.count(),
    photos: await prisma.accommodationPhoto.count(),
    notificationDeliveries: await prisma.notificationDelivery.count(),
    notifications: await prisma.notification.count(),
    rosterAssignments: await prisma.rosterAssignment.count(),
    rosterSyncRuns: await prisma.rosterSyncRun.count({
      where: { sourceSystem: { in: ['MOCK', 'DEMO'] } },
    }),
    employeeSyncLogs: await prisma.employeeSyncLog.count({
      where: { sourceSystem: { in: ['MOCK', 'DEMO'] } },
    }),
    beds: demoBedIds.length,
    rooms: demoRoomIds.length,
    floors: demoFloorIds.length,
    buildings: demoBuildingIds.length,
    dormitories: demoDormIds.length,
    roomTypes: await prisma.roomType.count({ where: { code: { startsWith: 'DEMO-' } } }),
    facilities: await prisma.facility.count({ where: { code: { startsWith: 'DEMO-' } } }),
    policies: await prisma.accommodationPolicy.count({
      where: { code: { startsWith: 'DEMO-' } },
    }),
    employees: demoEmployeeIds.length,
    usersToIsolate: demoUserIds.length,
  };

  console.log(`[purge] mode: ${execute ? 'EXECUTE (transaksional)' : 'DRY-RUN (tidak mengubah apa pun)'}`);
  console.log('[purge] rencana penghapusan (hanya data ber-tag DEMO / dibuat akun demo):');
  for (const [table, count] of Object.entries(counts)) console.log(`  ${table}: ${count}`);
  console.log('[purge] DIPERTAHANKAN: locations, roles, permissions, role_permissions, system_settings, audit_logs, batch impor nyata.');
  console.log('[purge] Akun demo DIISOLASI (DISABLED, tanpa kredensial/peran/sesi) karena audit_logs append-only melarang penghapusan aktor yang tercatat.');

  if (!execute) {
    console.log('[purge] Jalankan dengan --execute untuk applying setelah backup diverifikasi.');
    return;
  }

  const photoKeys = (
    await prisma.accommodationPhoto.findMany({
      select: { objectKey: true, thumbnailKey: true },
    })
  ).flatMap((photo) => [
    { bucket: STORAGE_BUCKETS.assets, key: photo.objectKey },
    { bucket: STORAGE_BUCKETS.assets, key: photo.thumbnailKey },
  ]);
  const attachmentKeys = (
    await prisma.attachment.findMany({ select: { objectKey: true } })
  ).map((attachment) => ({ bucket: STORAGE_BUCKETS.evidence, key: attachment.objectKey }));

  const deleted = await prisma.$transaction(
    async (tx) => {
      const result: Record<string, number> = {};
      result.recommendations = (await tx.accommodationRecommendation.deleteMany()).count;
      result.bedAllocations = (await tx.bedAllocation.deleteMany()).count;
      // Cascade: guests, events, approvals, checkins, checkouts, qr tokens.
      result.reservations = (await tx.reservation.deleteMany()).count;
      // Cascade: checklist items.
      result.housekeepingTasks = (await tx.housekeepingTask.deleteMany()).count;
      result.maintenanceTickets = (await tx.maintenanceTicket.deleteMany()).count;
      result.inventoryBlocks = (await tx.inventoryBlock.deleteMany()).count;
      result.attachments = (await tx.attachment.deleteMany()).count;
      result.photos = (await tx.accommodationPhoto.deleteMany()).count;
      result.notificationDeliveries = (await tx.notificationDelivery.deleteMany()).count;
      result.notifications = (await tx.notification.deleteMany()).count;
      result.rosterAssignments = (await tx.rosterAssignment.deleteMany()).count;
      result.rosterSyncRuns = (
        await tx.rosterSyncRun.deleteMany({ where: { sourceSystem: { in: ['MOCK', 'DEMO'] } } })
      ).count;
      result.employeeSyncLogs = (
        await tx.employeeSyncLog.deleteMany({ where: { sourceSystem: { in: ['MOCK', 'DEMO'] } } })
      ).count;
      result.beds = (await tx.bed.deleteMany({ where: { id: { in: demoBedIds } } })).count;
      // Cascade: room_facilities.
      result.rooms = (await tx.room.deleteMany({ where: { id: { in: demoRoomIds } } })).count;
      result.floors = (await tx.floor.deleteMany({ where: { id: { in: demoFloorIds } } })).count;
      result.buildings = (
        await tx.building.deleteMany({ where: { id: { in: demoBuildingIds } } })
      ).count;
      result.dormitories = (
        await tx.dormitory.deleteMany({ where: { id: { in: demoDormIds } } })
      ).count;
      result.roomTypes = (
        await tx.roomType.deleteMany({ where: { code: { startsWith: 'DEMO-' } } })
      ).count;
      result.facilities = (
        await tx.facility.deleteMany({ where: { code: { startsWith: 'DEMO-' } } })
      ).count;
      result.policies = (
        await tx.accommodationPolicy.deleteMany({ where: { code: { startsWith: 'DEMO-' } } })
      ).count;
      result.employees = (
        await tx.employee.deleteMany({ where: { id: { in: demoEmployeeIds } } })
      ).count;
      // audit_logs is append-only: its actorUserId SetNull FK would UPDATE audit
      // rows, which the immutability trigger rejects. Demo users are therefore
      // isolated (inactive, credential-less, role-less) instead of deleted, so
      // historical audit attribution stays intact.
      result.userRoles = (
        await tx.userRole.deleteMany({ where: { userId: { in: demoUserIds } } })
      ).count;
      result.sessions = (
        await tx.session.deleteMany({ where: { userId: { in: demoUserIds } } })
      ).count;
      result.usersIsolated = (
        await tx.user.updateMany({
          where: { id: { in: demoUserIds } },
          data: { status: 'DISABLED', demoPasswordHash: null },
        })
      ).count;
      return result;
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  console.log('[purge] hasil penghapusan DB:');
  for (const [table, count] of Object.entries(deleted)) console.log(`  ${table}: ${count}`);

  let storageRemoved = 0;
  let storageFailed = 0;
  for (const object of [...photoKeys, ...attachmentKeys]) {
    try {
      await removeObject(object.bucket, object.key);
      storageRemoved += 1;
    } catch {
      storageFailed += 1;
    }
  }
  console.log(`[purge] objek MinIO dihapus: ${storageRemoved}, gagal: ${storageFailed}`);

  const remaining = {
    users: await prisma.user.count(),
    employees: await prisma.employee.count(),
    dormitories: await prisma.dormitory.count(),
    rooms: await prisma.room.count(),
    beds: await prisma.bed.count(),
    reservations: await prisma.reservation.count(),
    locations: await prisma.location.count(),
    roles: await prisma.role.count(),
    auditLogs: await prisma.auditLog.count(),
  };
  console.log('[purge] sisa baris (harus 0 untuk operasional, master nyata tetap ada):');
  for (const [table, count] of Object.entries(remaining)) console.log(`  ${table}: ${count}`);
}

main()
  .catch((error) => {
    console.error('[purge] gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });