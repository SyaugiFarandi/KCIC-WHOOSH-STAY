import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AvailabilityResult, ReservationDetail } from '@whoosh/shared';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loginAs>>['agent'];

function isoDate(offsetDays: number): string {
  // API validates check-in against Asia/Jakarta "today"; UTC dates fail between 00:00–07:00 WIB.
  const base = new Date(Date.now() + 7 * 3_600_000);
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

async function findAvailability(agent: Agent, checkIn: string, checkOut: string) {
  const response = await agent.get(
    `/api/v1/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
  );
  expect(response.status).toBe(200);
  return response.body.data as AvailabilityResult;
}

async function cleanupReservation(id: string): Promise<void> {
  await prisma.housekeepingTask.deleteMany({ where: { reservationId: id } });
  await prisma.bedAllocation.deleteMany({ where: { reservationId: id } });
  await prisma.reservation.deleteMany({ where: { id } });
}

const createdReservationIds: string[] = [];

afterAll(async () => {
  for (const id of createdReservationIds) {
    await cleanupReservation(id);
  }
});

describe('reservation lifecycle', () => {
  let crewEmployeeId: string;

  beforeAll(async () => {
    // Check-outs from earlier runs leave demo rooms DIRTY and the seed upsert does
    // not reset operational state, so normalize the synthetic fixture first.
    const dormitory = await prisma.dormitory.findFirstOrThrow({ where: { code: 'DEMO-DORM-01' } });
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

    const { body } = await loginAs(DEMO_ACCOUNTS.crew);
    crewEmployeeId = body.data.user.employeeId!;
    expect(crewEmployeeId).toBeTruthy();
  });

  it('serves availability grouped by dormitory for crew', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.crew);
    const availability = await findAvailability(agent, isoDate(120), isoDate(122));
    expect(availability.dormitories.length).toBeGreaterThan(0);
    const withBeds = availability.dormitories.filter((item) => item.availableBeds > 0);
    expect(withBeds.length).toBeGreaterThan(0);
    expect(withBeds[0]!.beds[0]).toMatchObject({
      id: expect.any(String),
      bedCode: expect.any(String),
      roomNumber: expect.any(String),
    });
  });

  it('creates, approves, issues QR, checks in and checks out a stay', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const frontDesk = await loginAs(DEMO_ACCOUNTS.frontdesk);
    const checkIn = isoDate(0);
    const checkOut = isoDate(1);

    const availability = await findAvailability(crew.agent, checkIn, checkOut);
    // The demo front desk account is scoped to DEMO-DORM-01, so the lifecycle must run there.
    const dormitory = availability.dormitories.find(
      (item) => item.dormitoryCode === 'DEMO-DORM-01' && item.availableBeds > 0,
    );
    expect(dormitory).toBeTruthy();
    const bed = dormitory!.beds[0]!;

    await prisma.bed.update({
      where: { id: bed.id },
      data: { housekeepingStatus: 'READY', status: 'ACTIVE' },
    });
    await prisma.room.update({
      where: { id: bed.roomId },
      data: { housekeepingStatus: 'READY', operationalStatus: 'ACTIVE' },
    });

    const idempotencyKey = `test-lifecycle-${Date.now()}`;
    const created = await crew.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory!.dormitoryId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      purpose: 'Integration test lifecycle',
      bedIds: [bed.id],
      idempotencyKey,
    });
    expect(created.status).toBe(201);
    expect(created.body.success).toBe(true);
    const detail = created.body.data as ReservationDetail;
    createdReservationIds.push(detail.id);
    expect(detail.status).toBe('PENDING_APPROVAL');
    expect(detail.allocations).toHaveLength(1);
    expect(detail.allocations[0]!.bedId).toBe(bed.id);
    expect(detail.guests[0]!.employeeId).toBe(crewEmployeeId);

    const replay = await crew.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory!.dormitoryId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      bedIds: [bed.id],
      idempotencyKey,
    });
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(detail.id);

    const selfApprove = await crew.agent
      .post(`/api/v1/reservations/${detail.id}/approve`)
      .send({});
    expect(selfApprove.status).toBe(403);

    const approved = await manager.agent
      .post(`/api/v1/reservations/${detail.id}/approve`)
      .send({ comment: 'Disetujui untuk pengujian integrasi' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('CONFIRMED');
    expect(approved.body.data.approvalStatus).toBe('APPROVED');

    const qr = await crew.agent.post(`/api/v1/reservations/${detail.id}/qr`).send({});
    expect(qr.status).toBe(200);
    const token = qr.body.data.token as string;
    expect(token).toHaveLength(64);
    expect(new Date(qr.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const validation = await frontDesk.agent
      .post('/api/v1/stays/validate-qr')
      .send({ token });
    expect(validation.status).toBe(200);
    expect(validation.body.data.valid).toBe(true);
    expect(validation.body.data.canCheckIn).toBe(true);

    const crewValidate = await crew.agent.post('/api/v1/stays/validate-qr').send({ token });
    expect(crewValidate.status).toBe(403);

    const checkInResponse = await frontDesk.agent
      .post('/api/v1/stays/check-in')
      .send({ token });
    expect(checkInResponse.status).toBe(200);
    expect(checkInResponse.body.data.status).toBe('CHECKED_IN');
    expect(checkInResponse.body.data.checkins).toHaveLength(1);

    const reusedQr = await frontDesk.agent.post('/api/v1/stays/check-in').send({ token });
    expect(reusedQr.status).toBe(409);
    expect(reusedQr.body.error.code).toBe('QR_ALREADY_USED');

    const active = await frontDesk.agent.get('/api/v1/stays/active');
    expect(active.status).toBe(200);
    expect(
      active.body.data.items.some((item: { reservationId: string }) => item.reservationId === detail.id),
    ).toBe(true);

    const checkout = await frontDesk.agent.post('/api/v1/stays/check-out').send({
      reservationId: detail.id,
      roomCondition: 'GOOD',
      notes: 'Checkout integrasi',
    });
    expect(checkout.status).toBe(200);
    expect(checkout.body.data.status).toBe('CHECKED_OUT');

    const allocation = await prisma.bedAllocation.findFirst({
      where: { reservationId: detail.id },
    });
    expect(allocation?.status).toBe('RELEASED');

    const housekeeping = await prisma.housekeepingTask.findFirst({
      where: { reservationId: detail.id },
    });
    expect(housekeeping?.status).toBe('PENDING');

    await cleanupReservation(detail.id);
    createdReservationIds.splice(createdReservationIds.indexOf(detail.id), 1);
  });

  it('allows only one of two concurrent requests to allocate the same bed', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const crew2 = await loginAs(DEMO_ACCOUNTS.crew2);
    const checkIn = isoDate(150);
    const checkOut = isoDate(152);

    const availability = await findAvailability(crew.agent, checkIn, checkOut);
    const dormitory = availability.dormitories.find((item) => item.availableBeds > 0);
    expect(dormitory).toBeTruthy();
    const bed = dormitory!.beds[0]!;

    const payload = {
      dormitoryId: dormitory!.dormitoryId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      bedIds: [bed.id],
    };

    const [first, second] = await Promise.all([
      crew.agent
        .post('/api/v1/reservations')
        .send({ ...payload, idempotencyKey: `concurrency-a-${Date.now()}` }),
      crew2.agent
        .post('/api/v1/reservations')
        .send({ ...payload, idempotencyKey: `concurrency-b-${Date.now()}` }),
    ]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([201, 409]);
    const conflict = first.status === 409 ? first : second;
    expect(conflict.body.error.code).toBe('BED_ALLOCATION_CONFLICT');

    const winner = first.status === 201 ? first : second;
    const winnerId = winner.body.data.id as string;
    createdReservationIds.push(winnerId);

    const held = await prisma.bedAllocation.count({
      where: { reservationId: winnerId, status: 'HELD' },
    });
    expect(held).toBe(1);

    const duplicate = await prisma.bedAllocation.count({
      where: { bedId: bed.id, status: 'HELD', stayStart: new Date(checkIn) },
    });
    expect(duplicate).toBe(1);

    await cleanupReservation(winnerId);
    createdReservationIds.splice(createdReservationIds.indexOf(winnerId), 1);
  });

  it('rejects a pending reservation and releases held allocations', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const checkIn = isoDate(170);
    const checkOut = isoDate(172);

    const availability = await findAvailability(crew.agent, checkIn, checkOut);
    const dormitory = availability.dormitories.find((item) => item.availableBeds > 0);
    expect(dormitory).toBeTruthy();

    const created = await crew.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory!.dormitoryId,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      purpose: 'Integration rejection test',
    });
    expect(created.status).toBe(201);
    const detail = created.body.data as ReservationDetail;
    createdReservationIds.push(detail.id);
    expect(detail.status).toBe('PENDING_APPROVAL');

    const rejected = await manager.agent
      .post(`/api/v1/reservations/${detail.id}/reject`)
      .send({ reason: 'Jadwal operasional tidak memungkinkan' });
    expect(rejected.status).toBe(200);
    expect(rejected.body.data.status).toBe('REJECTED');

    const released = await prisma.bedAllocation.findMany({
      where: { reservationId: detail.id },
    });
    expect(released.every((row) => row.status === 'CANCELLED')).toBe(true);

    await cleanupReservation(detail.id);
    createdReservationIds.splice(createdReservationIds.indexOf(detail.id), 1);
  });

  it('blocks crew from managing other crew reservations', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const crew2 = await loginAs(DEMO_ACCOUNTS.crew2);

    const list = await crew.agent.get('/api/v1/reservations?pageSize=50');
    expect(list.status).toBe(200);
    const foreign = (list.body.data.items as Array<{ id: string; employeeName: string }>)[0];
    if (!foreign) return;

    const otherList = await crew2.agent.get('/api/v1/reservations?pageSize=50');
    expect(otherList.status).toBe(200);
    const otherIds = new Set(
      (otherList.body.data.items as Array<{ id: string }>).map((item) => item.id),
    );
    const blockedId = (list.body.data.items as Array<{ id: string }>).find(
      (item) => !otherIds.has(item.id),
    )?.id;
    if (!blockedId) return;

    const attempt = await crew2.agent.get(`/api/v1/reservations/${blockedId}`);
    expect(attempt.status).toBe(403);
  });
});
