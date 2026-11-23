import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROLES } from '@whoosh/shared';
import { hashPassword } from '../lib/password.js';
import { prisma } from '../lib/prisma.js';
import { seedDemoPhotos } from './demo-photos.js';

// Development-only demo accommodation dataset.
// All rows are explicitly labelled DEMO / test data. No KCIC ownership, address,
// or operational fact is implied. No users, roles, permissions, or settings are created.

const databaseUrl = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed demo akomodasi tidak boleh dijalankan pada lingkungan production.');
}
const databaseName = (() => {
  try {
    return new URL(databaseUrl).pathname.replace(/^\//, '');
  } catch {
    return '';
  }
})();
if (databaseName !== 'whoosh_stay') {
  throw new Error(
    `Seed demo akomodasi hanya untuk database pengembangan whoosh_stay (terdeteksi: ${databaseName || 'tidak diketahui'}).`,
  );
}

const CONFIRM = process.argv.includes('--confirm');
const SOURCE_REFERENCE = 'DEMO_ACCOMMODATION_V1';
const CREW_EMAIL = 'crew.demo@demo.whoosh-stay.local';
const CREW_EMPLOYEE_EXTERNAL_ID = 'DEMO-ACC-EMP-01';

const DORMITORIES = [
  { code: 'DEMO-DORM-01', area: 'Halim', locationCode: 'HALIM', stationCode: 'DEMO-HLM' },
  { code: 'DEMO-DORM-02', area: 'Karawang', locationCode: 'KARAWANG', stationCode: 'DEMO-KWR' },
  { code: 'DEMO-DORM-03', area: 'Padalarang', locationCode: 'PADALARANG', stationCode: 'DEMO-PDL' },
  { code: 'DEMO-DORM-04', area: 'Tegalluar', locationCode: 'TEGALLUAR', stationCode: 'DEMO-TGL' },
  { code: 'DEMO-DORM-05', area: 'Depo 501', locationCode: 'DEPO-501', stationCode: 'DEMO-DP5' },
] as const;

const BED_CODES = ['A', 'B', 'C', 'D', 'E'];
const MS_PER_DAY = 86_400_000;

type AllocationStatus = 'HELD' | 'ACTIVE' | 'RELEASED';

interface ReservationPlan {
  index: number;
  status: 'CHECKED_OUT' | 'CHECKED_IN' | 'CONFIRMED' | 'PENDING_APPROVAL' | 'CANCELLED';
  approvalStatus: 'APPROVED' | 'PENDING' | 'NOT_REQUIRED';
  allocation: AllocationStatus | null;
  checkInDate: Date;
  checkOutDate: Date;
  checkin: boolean;
  checkout: boolean;
  approvalDecision: 'APPROVED' | 'PENDING' | null;
}

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function buildReservationPlans(today: Date): ReservationPlan[] {
  const plans: ReservationPlan[] = [];
  for (let index = 0; index < 12; index += 1) {
    if (index < 6) {
      const checkInDate = addDays(today, -10 + index);
      plans.push({
        index,
        status: 'CHECKED_OUT',
        approvalStatus: 'APPROVED',
        allocation: 'RELEASED',
        checkInDate,
        checkOutDate: addDays(checkInDate, 2),
        checkin: true,
        checkout: true,
        approvalDecision: 'APPROVED',
      });
    } else if (index < 8) {
      const checkInDate = addDays(today, -1);
      plans.push({
        index,
        status: 'CHECKED_IN',
        approvalStatus: 'APPROVED',
        allocation: 'ACTIVE',
        checkInDate,
        checkOutDate: addDays(today, 2),
        checkin: true,
        checkout: false,
        approvalDecision: 'APPROVED',
      });
    } else if (index < 10) {
      const checkInDate = addDays(today, 2 + (index % 2));
      plans.push({
        index,
        status: 'CONFIRMED',
        approvalStatus: 'APPROVED',
        allocation: 'HELD',
        checkInDate,
        checkOutDate: addDays(checkInDate, 2),
        checkin: false,
        checkout: false,
        approvalDecision: 'APPROVED',
      });
    } else if (index === 10) {
      const checkInDate = addDays(today, 3);
      plans.push({
        index,
        status: 'PENDING_APPROVAL',
        approvalStatus: 'PENDING',
        allocation: 'HELD',
        checkInDate,
        checkOutDate: addDays(checkInDate, 2),
        checkin: false,
        checkout: false,
        approvalDecision: 'PENDING',
      });
    } else {
      const checkInDate = addDays(today, 4);
      plans.push({
        index,
        status: 'CANCELLED',
        approvalStatus: 'NOT_REQUIRED',
        allocation: null,
        checkInDate,
        checkOutDate: addDays(checkInDate, 2),
        checkin: false,
        checkout: false,
        approvalDecision: null,
      });
    }
  }
  const crewCheckIn = addDays(today, -1);
  plans.push({
    index: 12,
    status: 'CHECKED_IN',
    approvalStatus: 'APPROVED',
    allocation: 'ACTIVE',
    checkInDate: crewCheckIn,
    checkOutDate: addDays(today, 2),
    checkin: true,
    checkout: false,
    approvalDecision: 'APPROVED',
  });
  const crewUpcoming = addDays(today, 3);
  plans.push({
    index: 13,
    status: 'CONFIRMED',
    approvalStatus: 'APPROVED',
    allocation: 'HELD',
    checkInDate: crewUpcoming,
    checkOutDate: addDays(crewUpcoming, 2),
    checkin: false,
    checkout: false,
    approvalDecision: 'APPROVED',
  });
  const crewPast = addDays(today, -8);
  plans.push({
    index: 14,
    status: 'CHECKED_OUT',
    approvalStatus: 'APPROVED',
    allocation: 'RELEASED',
    checkInDate: crewPast,
    checkOutDate: addDays(crewPast, 2),
    checkin: true,
    checkout: true,
    approvalDecision: 'APPROVED',
  });
  return plans;
}

async function main() {
  const [dormitoryCount, roomCount, bedCount, reservationCount, syntheticEmployees, admin] =
    await Promise.all([
      prisma.dormitory.count(),
      prisma.room.count(),
      prisma.bed.count(),
      prisma.reservation.count(),
      prisma.employee.findMany({
        where: { sourceSystem: 'SYNTHETIC', employmentStatus: 'ACTIVE' },
        orderBy: { employeeCode: 'asc' },
        take: 12,
        select: { id: true, employeeCode: true },
      }),
      prisma.user.findFirst({
        where: { status: 'ACTIVE', roles: { some: { role: { code: 'SYSTEM_ADMIN' } } } },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      }),
    ]);

  if (!admin) throw new Error('Tidak ada pengguna SYSTEM_ADMIN aktif untuk atribusi verifikasi demo.');
  if (syntheticEmployees.length < 12) {
    throw new Error(
      `Butuh minimal 12 karyawan SYNTHETIC aktif (tersedia ${syntheticEmployees.length}). Jalankan employees:seed-synthetic terlebih dahulu.`,
    );
  }

  const locations = await prisma.location.findMany({ select: { id: true, code: true } });
  const locationByCode = new Map(locations.map((location) => [location.code, location.id]));

  console.log('[demo-seed] Rencana dataset demo akomodasi (data uji, bukan fasilitas KCIC):');
  console.log(
    `[demo-seed] Saat ini: dormitories=${dormitoryCount}, rooms=${roomCount}, beds=${bedCount}, reservations=${reservationCount}`,
  );
  for (const spec of DORMITORIES) {
    const locationId = locationByCode.get(spec.locationCode);
    console.log(
      `[demo-seed] ${spec.code} — ${spec.area}: 1 gedung, 2 lantai, 6 kamar, 30 bed, 6 foto area + 30 set foto kamar${
        locationId ? '' : ' (lokasi tidak ditemukan: locationId null)'
      }`,
    );
  }
  console.log('[demo-seed] 15 reservasi contoh (6 CHECKED_OUT, 3 CHECKED_IN, 3 CONFIRMED, 1 PENDING_APPROVAL, 1 CANCELLED, 1 riwayat crew).');
  console.log(`[demo-seed] Akun crew demo (${CREW_EMAIL}) dibuat bila belum ada; password acak disimpan di .secrets.`);

  if (!CONFIRM) {
    console.log('[demo-seed] DRY RUN. Jalankan ulang dengan --confirm untuk menulis data.');
    return;
  }

  const today = todayUtcDate();

  const summary = await prisma.$transaction(
    async (tx) => {
      const roomTypeStandard = await tx.roomType.upsert({
        where: { code: 'DEMO-STD' },
        update: { name: 'DEMO Kamar Standar (data uji)' },
        create: {
          code: 'DEMO-STD',
          name: 'DEMO Kamar Standar (data uji)',
          defaultCapacity: 5,
          status: 'ACTIVE',
          description: 'Tipe kamar demo untuk pengujian alur aplikasi.',
        },
      });
      const roomTypeTwin = await tx.roomType.upsert({
        where: { code: 'DEMO-TWIN' },
        update: { name: 'DEMO Kamar Twin (data uji)' },
        create: {
          code: 'DEMO-TWIN',
          name: 'DEMO Kamar Twin (data uji)',
          defaultCapacity: 5,
          status: 'ACTIVE',
          description: 'Tipe kamar demo untuk pengujian alur aplikasi.',
        },
      });

      const facilities = [];
      for (const facility of [
        { code: 'DEMO-WIFI', name: 'DEMO Wi-Fi (data uji)' },
        { code: 'DEMO-BATH', name: 'DEMO Kamar Mandi Dalam (data uji)' },
        { code: 'DEMO-AC', name: 'DEMO Penyejuk Udara (data uji)' },
      ]) {
        facilities.push(
          await tx.facility.upsert({
            where: { code: facility.code },
            update: { name: facility.name },
            create: { ...facility, status: 'ACTIVE' },
          }),
        );
      }

      const beds: Array<{ id: string; dormitoryId: string }> = [];
      let roomIndex = 0;

      const crewRole = await tx.role.findUnique({ where: { code: ROLES.CREW } });
      if (!crewRole) throw new Error(`Role ${ROLES.CREW} tidak ditemukan; jalankan seed dasar terlebih dahulu.`);

      const crewEmployee = await tx.employee.upsert({
        where: {
          sourceSystem_externalEmployeeId: {
            sourceSystem: 'DEMO',
            externalEmployeeId: CREW_EMPLOYEE_EXTERNAL_ID,
          },
        },
        update: { fullName: 'DEMO Crew Pengujian', employmentStatus: 'ACTIVE' },
        create: {
          sourceSystem: 'DEMO',
          externalEmployeeId: CREW_EMPLOYEE_EXTERNAL_ID,
          employeeCode: 'DEMO-ACC-EMP-01',
          fullName: 'DEMO Crew Pengujian',
          workEmail: 'demo.crew@example.invalid',
          departmentName: 'DEMO Crew Operations (data uji)',
          positionName: 'DEMO Crew (data uji)',
          employmentStatus: 'ACTIVE',
        },
      });

      const existingCrewUser = await tx.user.findUnique({ where: { email: CREW_EMAIL } });
      let crewPassword: string | null = null;
      let crewUser = existingCrewUser;
      if (!crewUser) {
        crewPassword = randomBytes(18).toString('base64url');
        crewUser = await tx.user.create({
          data: {
            email: CREW_EMAIL,
            displayName: 'DEMO Crew (data uji)',
            employeeId: crewEmployee.id,
            passwordHash: await hashPassword(crewPassword),
            status: 'ACTIVE',
          },
        });
      }
      const existingCrewRole = await tx.userRole.findFirst({
        where: { userId: crewUser.id, roleId: crewRole.id, scopeType: 'SELF' },
      });
      if (!existingCrewRole) {
        await tx.userRole.create({
          data: { userId: crewUser.id, roleId: crewRole.id, scopeType: 'SELF', scopeId: null },
        });
      }

      for (const spec of DORMITORIES) {
        const dormitory = await tx.dormitory.upsert({
          where: { code: spec.code },
          update: {
            name: `DEMO Dormitory ${spec.area} (data uji)`,
            stationCode: spec.stationCode,
            locationId: locationByCode.get(spec.locationCode) ?? null,
          },
          create: {
            code: spec.code,
            name: `DEMO Dormitory ${spec.area} (data uji)`,
            description:
              'DATA UJI / SIMULASI. Bukan fasilitas KCIC resmi dan tidak merepresentasikan kondisi lapangan.',
            address: 'DEMO — alamat fiktif, bukan lokasi nyata',
            stationCode: spec.stationCode,
            contactName: `DEMO Pengelola ${spec.area}`,
            contactPhone: 'DEMO-PHONE-0000',
            status: 'ACTIVE',
            locationId: locationByCode.get(spec.locationCode) ?? null,
          },
        });

        const building = await tx.building.upsert({
          where: { dormitoryId_code: { dormitoryId: dormitory.id, code: 'DEMO-A' } },
          update: { name: 'DEMO Gedung A (data uji)' },
          create: {
            dormitoryId: dormitory.id,
            code: 'DEMO-A',
            name: 'DEMO Gedung A (data uji)',
            status: 'ACTIVE',
          },
        });

        for (let floorNumber = 1; floorNumber <= 2; floorNumber += 1) {
          const floor = await tx.floor.upsert({
            where: { buildingId_floorNumber: { buildingId: building.id, floorNumber } },
            update: {},
            create: { buildingId: building.id, floorNumber, name: `Lantai ${floorNumber}` },
          });

          for (let roomNumberIndex = 1; roomNumberIndex <= 3; roomNumberIndex += 1) {
            const roomNumber = `${floorNumber}0${roomNumberIndex}`;
            const housekeepingStatus =
              roomIndex === 4 ? 'DIRTY' : roomIndex === 9 ? 'CLEANING' : 'READY';
            const room = await tx.room.upsert({
              where: { floorId_roomNumber: { floorId: floor.id, roomNumber } },
              update: {},
              create: {
                floorId: floor.id,
                roomTypeId: roomIndex % 2 === 0 ? roomTypeStandard.id : roomTypeTwin.id,
                roomNumber,
                name: `DEMO Kamar ${spec.code}-${roomNumber} (data uji)`,
                genderPolicy: 'UNSPECIFIED',
                operationalStatus: 'ACTIVE',
                housekeepingStatus,
              },
            });
            await tx.roomFacility.createMany({
              data: facilities.map((facility) => ({ roomId: room.id, facilityId: facility.id })),
              skipDuplicates: true,
            });

            for (const bedCode of BED_CODES) {
              const bed = await tx.bed.upsert({
                where: { roomId_bedCode: { roomId: room.id, bedCode } },
                update: {},
                create: {
                  roomId: room.id,
                  bedCode,
                  label: `Tempat tidur ${bedCode} (data uji)`,
                  status: 'ACTIVE',
                  housekeepingStatus: 'READY',
                },
              });
              beds.push({ id: bed.id, dormitoryId: dormitory.id });
            }
            roomIndex += 1;
          }
        }
      }

      const plans = buildReservationPlans(today);
      let reservationsCreated = 0;

      for (const plan of plans) {
        const bookingCode = `DEMO-ACC-RSV-${String(plan.index + 1).padStart(4, '0')}`;
        const existing = await tx.reservation.findUnique({ where: { bookingCode } });
        if (existing) continue;

        const bed = beds[plan.index % beds.length]!;
        const employee =
          plan.index < 12
            ? syntheticEmployees[plan.index % syntheticEmployees.length]!
            : crewEmployee;
        const requestedAt = new Date(plan.checkInDate.getTime() - 7 * MS_PER_DAY);

        const reservation = await tx.reservation.create({
          data: {
            bookingCode,
            primaryEmployeeId: employee.id,
            dormitoryId: bed.dormitoryId,
            source: plan.index % 3 === 0 ? 'MANAGEMENT' : 'CREW',
            sourceReference: SOURCE_REFERENCE,
            checkInDate: plan.checkInDate,
            checkOutDate: plan.checkOutDate,
            occupantCount: 1,
            purpose: 'DEMO: reservasi contoh untuk pengujian alur aplikasi (data uji)',
            status: plan.status,
            approvalStatus: plan.approvalStatus,
            requestedAt,
            createdAt: requestedAt,
            confirmedAt:
              plan.approvalStatus === 'APPROVED'
                ? new Date(requestedAt.getTime() + 3_600_000)
                : null,
            cancelledAt:
              plan.status === 'CANCELLED' ? new Date(requestedAt.getTime() + 7_200_000) : null,
            cancellationReason:
              plan.status === 'CANCELLED' ? 'DEMO: dibatalkan pada data uji' : null,
            approvedBy: plan.approvalStatus === 'APPROVED' ? admin.id : null,
            approvedAt:
              plan.approvalStatus === 'APPROVED'
                ? new Date(requestedAt.getTime() + 3_600_000)
                : null,
          },
        });

        const guest = await tx.reservationGuest.create({
          data: { reservationId: reservation.id, employeeId: employee.id, guestRole: 'PRIMARY' },
        });

        if (plan.allocation) {
          await tx.bedAllocation.create({
            data: {
              reservationId: reservation.id,
              reservationGuestId: guest.id,
              bedId: bed.id,
              stayStart: plan.checkInDate,
              stayEnd: plan.checkOutDate,
              status: plan.allocation,
              allocatedAt: requestedAt,
              releasedAt:
                plan.allocation === 'RELEASED'
                  ? new Date(plan.checkOutDate.getTime() + 6 * 3_600_000)
                  : null,
              allocatedBy: admin.id,
            },
          });
        }

        if (plan.checkin) {
          await tx.checkinRecord.create({
            data: {
              reservationId: reservation.id,
              employeeId: employee.id,
              checkedInAt: new Date(plan.checkInDate.getTime() + 14 * 3_600_000),
              verifiedBy: admin.id,
              verificationMethod: 'QR',
              notes: 'DEMO: check-in data uji',
            },
          });
        }

        if (plan.checkout) {
          await tx.checkoutRecord.create({
            data: {
              reservationId: reservation.id,
              employeeId: employee.id,
              checkedOutAt: new Date(plan.checkOutDate.getTime() + 8 * 3_600_000),
              verifiedBy: admin.id,
              roomCondition: 'GOOD',
              notes: 'DEMO: check-out data uji',
            },
          });
        }

        if (plan.approvalDecision) {
          await tx.reservationApproval.create({
            data: {
              reservationId: reservation.id,
              stepNumber: 1,
              approverRoleCode: 'DORMITORY_MANAGER',
              approverUserId: plan.approvalDecision === 'PENDING' ? null : admin.id,
              status: plan.approvalDecision,
              decisionAt:
                plan.approvalDecision === 'PENDING'
                  ? null
                  : new Date(requestedAt.getTime() + 3_600_000),
            },
          });
        }

        reservationsCreated += 1;
      }

      await tx.auditLog.create({
        data: {
          actorUserId: admin.id,
          action: 'DEMO_ACCOMMODATION_SEED',
          entityType: 'DORMITORY',
          reason: 'Labeled development demo dataset for UI and flow testing; not KCIC operational data.',
          afterData: {
            dormitories: DORMITORIES.map((spec) => spec.code),
            reservationsCreated,
            reservationPrefix: 'DEMO-ACC-RSV',
          },
        },
      });

      return { reservationsCreated, beds: beds.length, crewPassword };
    },
    { timeout: 120_000, maxWait: 15_000 },
  );

  console.log(
    `[demo-seed] Selesai: ${DORMITORIES.length} dormitory, ${summary.beds} bed, ${summary.reservationsCreated} reservasi baru.`,
  );

  if (summary.crewPassword) {
    const secretsDir = resolve(process.cwd(), '../../.secrets');
    mkdirSync(secretsDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const credentialFile = resolve(secretsDir, `demo-crew-password-${stamp}.txt`);
    writeFileSync(
      credentialFile,
      [
        `email: ${CREW_EMAIL}`,
        `password: ${summary.crewPassword}`,
        'note: akun crew demo pengembangan (data uji). Jangan dibagikan atau dipakai di production.',
        '',
      ].join('\n'),
      { mode: 0o600 },
    );
    console.log(`[demo-seed] Kredensial crew demo tersimpan di ${credentialFile} (tidak ditampilkan di log).`);
  }

  try {
    const photos = await seedDemoPhotos(prisma);
    console.log(
      photos.skipped
        ? '[demo-seed] Foto demo dilewati (sudah ada atau aset tidak ditemukan).'
        : `[demo-seed] ${photos.photos} foto demo tersimpan di storage.`,
    );
  } catch (error) {
    console.warn('[demo-seed] Penyimpanan foto demo gagal; data utama tetap tersimpan.', error);
  }
}

main()
  .catch((error) => {
    console.error('[demo-seed] Gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
