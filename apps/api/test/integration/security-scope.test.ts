import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ROLES } from '@whoosh/shared';
import { prisma } from '../../src/lib/prisma.js';
import { addDays, formatDateOnly, todayDateOnly } from '../../src/lib/dates.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const BUILDING_USER = 'sec-building@demo.whoosh-stay.local';
const DORM_ADMIN_USER = 'sec-dormadmin@demo.whoosh-stay.local';
const SELF_MAINT_USER = 'sec-selfmaint@demo.whoosh-stay.local';
const TASK_HK_USER = 'sec-taskhk@demo.whoosh-stay.local';

async function ensureUser(email: string, roleCode: string, scopeType: string, scopeId: string | null) {
  const role = await prisma.role.findUniqueOrThrow({ where: { code: roleCode } });
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({ data: { email, displayName: email, status: 'ACTIVE' } }));
  await prisma.userRole.deleteMany({ where: { userId: user.id } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id, scopeType, scopeId } });
  return user;
}

describe('security scope isolation', () => {
  let dormitoryId: string;
  let buildingAId: string;
  let buildingBId: string;
  let floorBId: string;
  let roomBId: string;
  let bedBId: string;
  let reservationBId: string;
  let ownTicketId: string;
  let otherTicketId: string;
  let ownTaskId: string;
  let otherTaskId: string;
  let buildingAActiveBeds: number;

  let buildingAgent: Awaited<ReturnType<typeof loginAs>>['agent'];
  let dormAdminAgent: Awaited<ReturnType<typeof loginAs>>['agent'];
  let selfMaintAgent: Awaited<ReturnType<typeof loginAs>>['agent'];
  let taskHkAgent: Awaited<ReturnType<typeof loginAs>>['agent'];
  let crewAgent: Awaited<ReturnType<typeof loginAs>>['agent'];

  const today = todayDateOnly();
  const tomorrow = addDays(today, 1);
  const yesterday = addDays(today, -1);
  const dayAfter = addDays(today, 2);

  beforeAll(async () => {
    const dormitory = await prisma.dormitory.findFirstOrThrow({
      where: { code: 'DEMO-DORM-01' },
      include: { buildings: { include: { floors: { include: { rooms: true } } } } },
    });
    dormitoryId = dormitory.id;
    const buildingA = dormitory.buildings[0];
    buildingAId = buildingA.id;
    const roomA = buildingA.floors[0].rooms[0];

    const buildingB = await prisma.building.create({
      data: { dormitoryId, code: 'SEC-BLD-B', name: 'Security scope building B' },
    });
    buildingBId = buildingB.id;
    const floorB = await prisma.floor.create({
      data: { buildingId: buildingBId, floorNumber: 99, name: 'Security floor' },
    });
    floorBId = floorB.id;
    const roomB = await prisma.room.create({
      data: { floorId: floorBId, roomTypeId: roomA.roomTypeId, roomNumber: 'SEC-9901' },
    });
    roomBId = roomB.id;
    const bedB = await prisma.bed.create({ data: { roomId: roomBId, bedCode: 'SEC-9901-A' } });
    bedBId = bedB.id;

    const crewUser = await prisma.user.findUnique({
      where: { email: DEMO_ACCOUNTS.crew },
      select: { employeeId: true },
    });
    const employee = await prisma.employee.findFirstOrThrow({
      where: {
        employmentStatus: 'ACTIVE',
        ...(crewUser?.employeeId ? { id: { not: crewUser.employeeId } } : {}),
      },
    });
    const reservationB = await prisma.reservation.create({
      data: {
        bookingCode: 'WS-SEC-SCOPE-B',
        primaryEmployeeId: employee.id,
        dormitoryId,
        source: 'CREW',
        checkInDate: yesterday,
        checkOutDate: dayAfter,
        occupantCount: 1,
        status: 'CHECKED_IN',
        approvalStatus: 'NOT_REQUIRED',
        guests: { create: { employeeId: employee.id, guestRole: 'PRIMARY' } },
      },
      include: { guests: true },
    });
    reservationBId = reservationB.id;
    await prisma.bedAllocation.create({
      data: {
        reservationId: reservationBId,
        reservationGuestId: reservationB.guests[0].id,
        bedId: bedBId,
        stayStart: yesterday,
        stayEnd: dayAfter,
        status: 'ACTIVE',
      },
    });

    buildingAActiveBeds = await prisma.bed.count({
      where: { status: 'ACTIVE', room: { floor: { buildingId: buildingAId } } },
    });

    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: DEMO_ACCOUNTS.admin } });
    await ensureUser(BUILDING_USER, ROLES.FRONT_DESK, 'BUILDING', buildingAId);
    await ensureUser(DORM_ADMIN_USER, ROLES.DORMITORY_ADMIN, 'DORMITORY', dormitoryId);
    const selfUser = await ensureUser(SELF_MAINT_USER, ROLES.MAINTENANCE, 'SELF', null);
    const taskUser = await ensureUser(TASK_HK_USER, ROLES.HOUSEKEEPING, 'ASSIGNED_TASK', null);

    const ownTicket = await prisma.maintenanceTicket.create({
      data: {
        ticketCode: 'WS-SEC-TICK-OWN',
        roomId: roomBId,
        category: 'OTHER',
        priority: 'LOW',
        description: 'Security scope own ticket',
        reportedBy: selfUser.id,
      },
    });
    ownTicketId = ownTicket.id;
    const otherTicket = await prisma.maintenanceTicket.create({
      data: {
        ticketCode: 'WS-SEC-TICK-OTHER',
        roomId: roomBId,
        category: 'OTHER',
        priority: 'LOW',
        description: 'Security scope other ticket',
        reportedBy: adminUser.id,
      },
    });
    otherTicketId = otherTicket.id;

    const ownTask = await prisma.housekeepingTask.create({
      data: { roomId: roomBId, taskType: 'CLEANING', status: 'PENDING', assignedTo: taskUser.id },
    });
    ownTaskId = ownTask.id;
    const otherTask = await prisma.housekeepingTask.create({
      data: { roomId: roomBId, taskType: 'CLEANING', status: 'PENDING', assignedTo: adminUser.id },
    });
    otherTaskId = otherTask.id;

    buildingAgent = (await loginAs(BUILDING_USER)).agent;
    dormAdminAgent = (await loginAs(DORM_ADMIN_USER)).agent;
    selfMaintAgent = (await loginAs(SELF_MAINT_USER)).agent;
    taskHkAgent = (await loginAs(TASK_HK_USER)).agent;
    crewAgent = (await loginAs(DEMO_ACCOUNTS.crew)).agent;
  });

  afterAll(async () => {
    await prisma.bedAllocation.deleteMany({ where: { reservationId: reservationBId } });
    await prisma.reservation.deleteMany({ where: { id: reservationBId } });
    await prisma.housekeepingTask.deleteMany({ where: { id: { in: [ownTaskId, otherTaskId] } } });
    await prisma.maintenanceTicket.deleteMany({ where: { id: { in: [ownTicketId, otherTicketId] } } });
    await prisma.bed.deleteMany({ where: { id: bedBId } });
    await prisma.room.deleteMany({ where: { id: roomBId } });
    await prisma.floor.deleteMany({ where: { id: floorBId } });
    await prisma.building.deleteMany({ where: { id: buildingBId } });
    // Synthetic principals stay in the test database because the audit trail is
    // append-only; ensureUser resets their role assignments on every run.
  });

  it('building-scoped principal cannot read reservations allocated in another building', async () => {
    const response = await buildingAgent.get('/api/v1/reservations?pageSize=100');
    expect(response.status).toBe(200);
    const ids = (response.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).not.toContain(reservationBId);
  });

  it('building-scoped search cannot escape reservation scope', async () => {
    const response = await buildingAgent.get('/api/v1/reservations?pageSize=100&q=WS-SEC-SCOPE-B');
    expect(response.status).toBe(200);
    const ids = (response.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).not.toContain(reservationBId);
  });

  it('self-scoped crew search cannot list other crews reservations', async () => {
    const response = await crewAgent.get('/api/v1/reservations?pageSize=100&q=WS-SEC-SCOPE-B');
    expect(response.status).toBe(200);
    const ids = (response.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).not.toContain(reservationBId);
  });

  it('building-scoped search cannot escape dormitory scope', async () => {
    const response = await buildingAgent.get('/api/v1/dormitories?pageSize=100&q=DEMO');
    expect(response.status).toBe(200);
    const items = response.body.data.items as Array<{ id: string }>;
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.id).toBe(dormitoryId);
    }
  });

  it('rejects malformed date filters with 400', async () => {
    const invalidCalendarDay = await buildingAgent.get('/api/v1/reservations?from=2026-02-31');
    expect(invalidCalendarDay.status).toBe(400);
    const junk = await buildingAgent.get('/api/v1/reservations?to=not-a-date');
    expect(junk.status).toBe(400);
  });

  it('building-scoped principal cannot see active stays in another building', async () => {    const response = await buildingAgent.get('/api/v1/stays/active?pageSize=200');
    expect(response.status).toBe(200);
    const ids = (response.body.data.items as Array<{ reservationId: string }>).map(
      (item) => item.reservationId,
    );
    expect(ids).not.toContain(reservationBId);
  });

  it('building-scoped calendar counts only beds in the scoped building', async () => {
    const response = await buildingAgent.get(
      `/api/v1/calendar?from=${formatDateOnly(today)}&to=${formatDateOnly(tomorrow)}&dormitoryId=${dormitoryId}`,
    );
    expect(response.status).toBe(200);
    expect(response.body.data.totalBeds).toBe(buildingAActiveBeds);
  });

  it('building-scoped occupancy report counts only beds in the scoped building', async () => {
    const response = await buildingAgent.get('/api/v1/reports/occupancy');
    expect(response.status).toBe(200);
    const row = (response.body.data.items as Array<{ dormitoryId: string; totalBeds: number }>).find(
      (item) => item.dormitoryId === dormitoryId,
    );
    expect(row?.totalBeds).toBe(buildingAActiveBeds);
  });

  it('building-scoped availability never exposes beds from another building', async () => {
    const response = await buildingAgent.get(
      `/api/v1/availability?checkIn=${formatDateOnly(today)}&checkOut=${formatDateOnly(tomorrow)}&dormitoryId=${dormitoryId}`,
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(bedBId);
  });

  it('dormitory-scoped admin cannot mutate global catalogs or global-only endpoints', async () => {
    const attempts = [
      dormAdminAgent.post('/api/v1/dormitories').send({ code: 'SEC-X', name: 'Denied', stationCode: 'X' }),
      dormAdminAgent
        .post('/api/v1/master-data/room-types')
        .send({ code: 'SEC-RT', name: 'Denied', defaultCapacity: 2 }),
      dormAdminAgent.post('/api/v1/facilities').send({ code: 'SEC-FAC', name: 'Denied' }),
      dormAdminAgent.get('/api/v1/roster/sync-runs'),
      dormAdminAgent.post('/api/v1/roster/preview').send({}),
      dormAdminAgent.get('/api/v1/settings'),
      dormAdminAgent.get('/api/v1/admin/notification-deliveries'),
    ];
    for (const response of await Promise.all(attempts)) {
      expect(response.status).toBe(403);
    }
  });

  it('SELF-scoped maintenance principal only reads tickets they reported', async () => {
    const response = await selfMaintAgent.get('/api/v1/maintenance/tickets?pageSize=100');
    expect(response.status).toBe(200);
    const ids = (response.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(ownTicketId);
    expect(ids).not.toContain(otherTicketId);
  });

  it('ASSIGNED_TASK housekeeping principal only sees and executes assigned tasks', async () => {
    const list = await taskHkAgent.get('/api/v1/housekeeping/tasks?pageSize=100');
    expect(list.status).toBe(200);
    const ids = (list.body.data.items as Array<{ id: string }>).map((item) => item.id);
    expect(ids).toContain(ownTaskId);
    expect(ids).not.toContain(otherTaskId);

    const own = await taskHkAgent
      .post(`/api/v1/housekeeping/tasks/${ownTaskId}/actions`)
      .send({ action: 'START' });
    expect(own.status).toBe(200);

    const other = await taskHkAgent
      .post(`/api/v1/housekeeping/tasks/${otherTaskId}/actions`)
      .send({ action: 'START' });
    expect(other.status).toBe(403);
  });
});