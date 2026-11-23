import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  ReservationExceptionDetail,
  ReservationExceptionListResult,
} from '@whoosh/shared';
import { prisma } from '../../src/lib/prisma.js';
import {
  allocationConflictKey,
  overbookingKey,
  recordReservationException,
} from '../../src/modules/exceptions/service.js';
import { DEMO_ACCOUNTS, loginAs, expectSuccessEnvelope } from './helpers.js';

function isoDate(offsetDays: number): string {
  // The API validates check-in against Asia/Jakarta "today"; shift 7h so UTC never lags WIB.
  const base = new Date(Date.now() + 7 * 3_600_000);
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

function toPrismaDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function findDormitory(code: string) {
  return prisma.dormitory.findUniqueOrThrow({ where: { code } });
}

async function findFreeBed(dormitoryId: string, checkIn: string, checkOut: string) {
  const bed = await prisma.bed.findFirst({
    where: {
      status: 'ACTIVE',
      room: {
        operationalStatus: 'ACTIVE',
        floor: { building: { dormitoryId, status: 'ACTIVE' } },
      },
      allocations: {
        none: {
          status: { in: ['HELD', 'ACTIVE'] },
          stayStart: { lt: toPrismaDate(checkOut) },
          stayEnd: { gt: toPrismaDate(checkIn) },
        },
      },
      inventoryBlocks: { none: {} },
    },
    orderBy: [{ roomId: 'asc' }, { bedCode: 'asc' }],
  });
  if (!bed) throw new Error(`No free bed in dormitory ${dormitoryId} for ${checkIn}..${checkOut}`);
  return bed;
}

async function findFreeWindow(dormitoryId: string): Promise<{ checkIn: string; checkOut: string }> {
  for (const offset of [40, 80, 120, 160]) {
    const checkIn = isoDate(offset);
    const checkOut = isoDate(offset + 2);
    const bed = await prisma.bed.findFirst({
      where: {
        status: 'ACTIVE',
        room: {
          operationalStatus: 'ACTIVE',
          floor: { building: { dormitoryId, status: 'ACTIVE' } },
        },
        allocations: {
          none: {
            status: { in: ['HELD', 'ACTIVE'] },
            stayStart: { lt: toPrismaDate(checkOut) },
            stayEnd: { gt: toPrismaDate(checkIn) },
          },
        },
      },
      select: { id: true },
    });
    if (bed) return { checkIn, checkOut };
  }
  throw new Error(`No free bed window found for dormitory ${dormitoryId}`);
}

async function cleanupReservation(id: string): Promise<void> {
  await prisma.housekeepingTask.deleteMany({ where: { reservationId: id } });
  await prisma.bedAllocation.deleteMany({ where: { reservationId: id } });
  await prisma.reservation.deleteMany({ where: { id } });
}

const createdReservationIds: string[] = [];
const createdExceptionKeys: string[] = [];

afterAll(async () => {
  if (createdExceptionKeys.length) {
    await prisma.reservationException.deleteMany({
      where: { dedupeKey: { in: createdExceptionKeys } },
    });
  }
  for (const id of createdReservationIds) {
    await cleanupReservation(id);
  }
});

describe('reservation exception center', () => {
  let employeeIds: string[] = [];

  beforeAll(async () => {
    // Fixture normalization: earlier runs can leave rooms/beds dirty, which blocks availability.
    const dormitory = await findDormitory('DEMO-DORM-01');
    const rooms = await prisma.room.findMany({
      where: { floor: { building: { dormitoryId: dormitory.id } } },
      select: { id: true },
    });
    const roomIds = rooms.map((room) => room.id);
    await prisma.room.updateMany({
      where: { id: { in: roomIds } },
      data: { housekeepingStatus: 'READY', operationalStatus: 'ACTIVE' },
    });
    await prisma.bed.updateMany({
      where: { roomId: { in: roomIds } },
      data: { housekeepingStatus: 'READY', status: 'ACTIVE' },
    });

    const other = await findDormitory('DEMO-DORM-05');
    await prisma.bed.updateMany({
      where: { room: { floor: { building: { dormitoryId: other.id } } } },
      data: { status: 'ACTIVE' },
    });

    const employees = await prisma.employee.findMany({
      where: {
        employmentStatus: 'ACTIVE',
        NOT: { eligibilityStatus: 'INELIGIBLE' },
      },
      orderBy: { employeeCode: 'asc' },
      take: 2,
      select: { id: true },
    });
    expect(employees).toHaveLength(2);
    employeeIds = employees.map((employee) => employee.id);
  });

  it('records ALLOCATION_CONFLICT once and increments occurrences on repeats', async () => {
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const dormitory = await findDormitory('DEMO-DORM-03');
    const { checkIn, checkOut } = await findFreeWindow(dormitory.id);
    const bed = await findFreeBed(dormitory.id, checkIn, checkOut);

    const payload = {
      dormitoryId: dormitory.id,
      employeeIds: [employeeIds[0]],
      occupantCount: 1,
      bedIds: [bed.id],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      autoConfirm: true,
    };

    const first = await manager.agent.post('/api/v1/reservations').send(payload);
    expect(first.status).toBe(201);
    createdReservationIds.push(first.body.data.id);

    const key = allocationConflictKey(dormitory.id, checkIn, checkOut, [bed.id]);
    createdExceptionKeys.push(key);

    const conflict = await manager.agent.post('/api/v1/reservations').send(payload);
    expect(conflict.status).toBe(409);
    expect(conflict.body.success).toBe(false);
    expect(conflict.body.error.code).toBe('ROOM_UNAVAILABLE');

    const recorded = await prisma.reservationException.findUnique({ where: { dedupeKey: key } });
    expect(recorded).toMatchObject({
      exceptionType: 'ALLOCATION_CONFLICT',
      severity: 'HIGH',
      status: 'OPEN',
      dormitoryId: dormitory.id,
      bedId: null,
      occurrenceCount: 1,
    });
    expect(recorded?.evidence).toMatchObject({
      checkInDate: checkIn,
      checkOutDate: checkOut,
      requestedBedIds: [bed.id],
    });

    const repeat = await manager.agent.post('/api/v1/reservations').send(payload);
    expect(repeat.status).toBe(409);

    const deduped = await prisma.reservationException.findUnique({ where: { dedupeKey: key } });
    expect(deduped?.occurrenceCount).toBe(2);
    expect(
      await prisma.reservationException.count({ where: { dedupeKey: key } }),
    ).toBe(1);
  });

  it('records OVERBOOKING when the dormitory cannot seat the requested guests', async () => {
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const dormitory = await findDormitory('DEMO-DORM-05');
    const { checkIn, checkOut } = await findFreeWindow(dormitory.id);

    const beds = await prisma.bed.findMany({
      where: { room: { floor: { building: { dormitoryId: dormitory.id } } } },
      orderBy: [{ roomId: 'asc' }, { bedCode: 'asc' }],
      select: { id: true, status: true },
    });
    const target = await findFreeBed(dormitory.id, checkIn, checkOut);
    const others = beds.filter((bed) => bed.id !== target.id);

    try {
      await prisma.bed.updateMany({
        where: { id: { in: others.map((bed) => bed.id) } },
        data: { status: 'INACTIVE' },
      });

      const response = await manager.agent.post('/api/v1/reservations').send({
        dormitoryId: dormitory.id,
        employeeIds,
        occupantCount: 2,
        checkInDate: checkIn,
        checkOutDate: checkOut,
        autoConfirm: true,
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('ROOM_UNAVAILABLE');

      const key = overbookingKey(dormitory.id, checkIn, checkOut, 2);
      createdExceptionKeys.push(key);
      const recorded = await prisma.reservationException.findUnique({ where: { dedupeKey: key } });
      expect(recorded).toMatchObject({
        exceptionType: 'OVERBOOKING',
        severity: 'HIGH',
        status: 'OPEN',
        dormitoryId: dormitory.id,
        occurrenceCount: 1,
      });
      expect(recorded?.evidence).toMatchObject({
        checkInDate: checkIn,
        checkOutDate: checkOut,
        occupantCount: 2,
      });
    } finally {
      for (const bed of others) {
        await prisma.bed.update({ where: { id: bed.id }, data: { status: bed.status } });
      }
    }
  });

  it('records READINESS_FAILURE when a check-in hits an unprepared bed', async () => {
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const dormitory = await findDormitory('DEMO-DORM-01');
    const checkIn = isoDate(0);
    const checkOut = isoDate(2);
    const bed = await findFreeBed(dormitory.id, checkIn, checkOut);

    const created = await manager.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory.id,
      employeeIds: [employeeIds[0]],
      occupantCount: 1,
      bedIds: [bed.id],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      autoConfirm: true,
    });
    expect(created.status).toBe(201);
    const reservationId = created.body.data.id as string;
    createdReservationIds.push(reservationId);

    const key = `READINESS_FAILURE:${reservationId}:${bed.id}`;
    createdExceptionKeys.push(key);

    try {
      await prisma.bed.update({
        where: { id: bed.id },
        data: { housekeepingStatus: 'DIRTY' },
      });

      const checkInResponse = await admin.agent
        .post('/api/v1/stays/check-in')
        .send({ reservationId });
      expect(checkInResponse.status).toBe(409);
      expect(checkInResponse.body.error.code).toBe('ROOM_UNAVAILABLE');

      const recorded = await prisma.reservationException.findUnique({ where: { dedupeKey: key } });
      expect(recorded).toMatchObject({
        exceptionType: 'READINESS_FAILURE',
        severity: 'HIGH',
        status: 'OPEN',
        reservationId,
        bedId: bed.id,
        dormitoryId: dormitory.id,
      });
      expect(recorded?.evidence).toMatchObject({
        bedHousekeepingStatus: 'DIRTY',
        reasons: expect.arrayContaining(['bed_housekeeping:DIRTY']),
      });
    } finally {
      await prisma.bed.update({
        where: { id: bed.id },
        data: { housekeepingStatus: 'READY' },
      });
    }
  });

  it('records ALLOCATION_MISSING when a check-in has no bed allocation', async () => {
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const dormitory = await findDormitory('DEMO-DORM-01');
    const checkIn = isoDate(0);
    const checkOut = isoDate(2);
    const bed = await findFreeBed(dormitory.id, checkIn, checkOut);

    const created = await manager.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory.id,
      employeeIds: [employeeIds[1]],
      occupantCount: 1,
      bedIds: [bed.id],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      autoConfirm: true,
    });
    expect(created.status).toBe(201);
    const reservationId = created.body.data.id as string;
    createdReservationIds.push(reservationId);

    const key = `ALLOCATION_MISSING:${reservationId}`;
    createdExceptionKeys.push(key);

    await prisma.bedAllocation.deleteMany({ where: { reservationId } });

    const checkInResponse = await admin.agent
      .post('/api/v1/stays/check-in')
      .send({ reservationId });
    expect(checkInResponse.status).toBe(409);
    expect(checkInResponse.body.error.code).toBe('RESERVATION_STATE_INVALID');

    const recorded = await prisma.reservationException.findUnique({ where: { dedupeKey: key } });
    expect(recorded).toMatchObject({
      exceptionType: 'ALLOCATION_MISSING',
      status: 'OPEN',
      reservationId,
      dormitoryId: dormitory.id,
    });
  });

  it('isolates exceptions by dormitory scope and keeps audits read-only', async () => {
    const dormitory = await findDormitory('DEMO-DORM-02');
    const key = `TEST-SCOPE-${randomUUID()}`;
    createdExceptionKeys.push(key);
    await recordReservationException({
      dedupeKey: key,
      type: 'READINESS_FAILURE',
      severity: 'MEDIUM',
      dormitoryId: dormitory.id,
      title: `Uji isolasi scope ${key}`,
      description: 'Baris uji untuk memastikan isolasi scope dormitory.',
    });
    const row = await prisma.reservationException.findUniqueOrThrow({ where: { dedupeKey: key } });

    const frontDesk = await loginAs(DEMO_ACCOUNTS.frontdesk);
    const listResponse = await frontDesk.agent.get('/api/v1/exceptions?pageSize=100');
    expectSuccessEnvelope(listResponse.body);
    const list = listResponse.body.data as ReservationExceptionListResult;
    expect(Array.isArray(list.items)).toBe(true);
    expect(list.items.some((item) => item.id === row.id)).toBe(false);

    const detailResponse = await frontDesk.agent.get(`/api/v1/exceptions/${row.id}`);
    expect(detailResponse.status).toBe(404);

    const karawang = await loginAs('frontdesk.karawang@demo.whoosh-stay.local');
    const scopedDetail = await karawang.agent.get(`/api/v1/exceptions/${row.id}`);
    expect(scopedDetail.status).toBe(200);
    const detail = scopedDetail.body.data as ReservationExceptionDetail;
    expect(detail.dormitoryCode).toBe('DEMO-DORM-02');
    expect(detail.dormitoryId).toBe(dormitory.id);

    const auditor = await loginAs(DEMO_ACCOUNTS.auditor);
    const auditList = await auditor.agent.get('/api/v1/exceptions?page=1&pageSize=1');
    expectSuccessEnvelope(auditList.body);
    const auditData = auditList.body.data as ReservationExceptionListResult;
    expect(auditData.items).toHaveLength(1);
    expect(auditData.pagination).toMatchObject({ page: 1, pageSize: 1 });
    expect(auditData.pagination.totalPages).toBe(
      Math.ceil(auditData.pagination.total / auditData.pagination.pageSize),
    );
    expect(auditList.body.meta.pagination).toEqual(auditData.pagination);
    for (const key of ['open', 'acknowledged', 'resolved', 'dismissed', 'criticalOpen']) {
      expect(typeof (auditData.counts as Record<string, unknown>)[key]).toBe('number');
    }

    const denied = await auditor.agent
      .patch(`/api/v1/exceptions/${row.id}/assign`)
      .send({ assignToSelf: true });
    expect(denied.status).toBe(403);

    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const crewList = await crew.agent.get('/api/v1/exceptions');
    expect(crewList.status).toBe(403);

    const missing = await auditor.agent.get(`/api/v1/exceptions/${randomUUID()}`);
    expect(missing.status).toBe(404);
  });

  it('enforces assign/resolve state transitions and reopens on re-detection', async () => {
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const managerId = manager.body.data.user.id;
    const dormitory = await findDormitory('DEMO-DORM-01');
    const key = `TEST-STATE-${randomUUID()}`;
    createdExceptionKeys.push(key);

    const seedRow = async () =>
      recordReservationException({
        dedupeKey: key,
        type: 'OVERBOOKING',
        severity: 'HIGH',
        dormitoryId: dormitory.id,
        title: `Uji state machine ${key}`,
        description: 'Baris uji untuk transisi status eksepsi.',
      });
    await seedRow();
    const row = await prisma.reservationException.findUniqueOrThrow({ where: { dedupeKey: key } });

    const assigned = await manager.agent
      .patch(`/api/v1/exceptions/${row.id}/assign`)
      .send({ assignToSelf: true });
    expect(assigned.status).toBe(200);
    const assignedDetail = assigned.body.data as ReservationExceptionDetail;
    expect(assignedDetail.status).toBe('ACKNOWLEDGED');
    expect(assignedDetail.assignedTo?.id).toBe(managerId);
    expect(assignedDetail.acknowledgedAt).not.toBeNull();

    const mine = await manager.agent.get(
      '/api/v1/exceptions?assignedToMe=true&status=ACKNOWLEDGED&pageSize=100',
    );
    const mineData = mine.body.data as ReservationExceptionListResult;
    expect(mineData.items.some((item) => item.id === row.id)).toBe(true);

    const released = await manager.agent
      .patch(`/api/v1/exceptions/${row.id}/assign`)
      .send({ assignedToUserId: null });
    expect(released.status).toBe(200);
    const releasedDetail = released.body.data as ReservationExceptionDetail;
    expect(releasedDetail.status).toBe('OPEN');
    expect(releasedDetail.assignedTo).toBeNull();
    expect(releasedDetail.acknowledgedAt).toBeNull();

    const invalidAssign = await manager.agent
      .patch(`/api/v1/exceptions/${row.id}/assign`)
      .send({ assignToSelf: true, assignedToUserId: randomUUID() });
    expect(invalidAssign.status).toBe(400);

    const shortNote = await manager.agent
      .patch(`/api/v1/exceptions/${row.id}/resolve`)
      .send({ status: 'RESOLVED', resolutionNote: 'no' });
    expect(shortNote.status).toBe(400);
    expect(shortNote.body.error.code).toBe('VALIDATION_ERROR');

    const resolved = await manager.agent
      .patch(`/api/v1/exceptions/${row.id}/resolve`)
      .send({ status: 'RESOLVED', resolutionNote: 'Kapasitas sudah ditambah tim operasional.' });
    expect(resolved.status).toBe(200);
    const resolvedDetail = resolved.body.data as ReservationExceptionDetail;
    expect(resolvedDetail.status).toBe('RESOLVED');
    expect(resolvedDetail.resolvedBy?.id).toBe(managerId);
    expect(resolvedDetail.resolvedAt).not.toBeNull();

    const resolvedAgain = await manager.agent
      .patch(`/api/v1/exceptions/${row.id}/resolve`)
      .send({ status: 'DISMISSED', resolutionNote: 'Sudah ditutup sebelumnya.' });
    expect(resolvedAgain.status).toBe(409);
    expect(resolvedAgain.body.error.code).toBe('EXCEPTION_STATE_INVALID');

    await seedRow();
    const reopened = await prisma.reservationException.findUniqueOrThrow({ where: { dedupeKey: key } });
    expect(reopened).toMatchObject({
      status: 'OPEN',
      occurrenceCount: 2,
      assignedTo: null,
      acknowledgedAt: null,
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
    });

    const missing = await manager.agent
      .patch(`/api/v1/exceptions/${randomUUID()}/assign`)
      .send({ assignToSelf: true });
    expect(missing.status).toBe(404);
  });
});
