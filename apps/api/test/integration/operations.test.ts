import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const createdTaskIds: string[] = [];
const createdTicketIds: string[] = [];
const createdRosterRunIds: string[] = [];
const rosterDate = (() => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 400);
  return value.toISOString().slice(0, 10);
})();
const rosterEndDate = (() => {
  const value = new Date(`${rosterDate}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
})();

afterAll(async () => {
  if (createdTaskIds.length) {
    await prisma.housekeepingTask.deleteMany({ where: { id: { in: createdTaskIds } } });
  }
  if (createdTicketIds.length) {
    await prisma.inventoryBlock.deleteMany({
      where: { sourceTicketId: { in: createdTicketIds } },
    });
    await prisma.maintenanceTicket.deleteMany({ where: { id: { in: createdTicketIds } } });
  }
  if (createdRosterRunIds.length) {
    await prisma.rosterSyncRun.deleteMany({ where: { id: { in: createdRosterRunIds } } });
  }
  await prisma.rosterAssignment.deleteMany({
    where: {
      sourceSystem: 'MOCK_ROSTER',
      dutyDate: { gte: new Date(rosterDate), lte: new Date(rosterEndDate) },
    },
  });
});

async function dormitoryOneRoom() {
  const dormitory = await prisma.dormitory.findUniqueOrThrow({
    where: { code: 'DEMO-DORM-01' },
    select: { id: true },
  });
  const room = await prisma.room.findFirstOrThrow({
    where: { floor: { building: { dormitoryId: dormitory.id } } },
    select: { id: true, roomNumber: true },
  });
  return { dormitoryId: dormitory.id, roomId: room.id, roomNumber: room.roomNumber };
}

describe('housekeeping workflow', () => {
  it('runs start, complete and verify with independent permissions', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const housekeeping = await loginAs(DEMO_ACCOUNTS.housekeeping);
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const room = await dormitoryOneRoom();

    const created = await admin.agent.post('/api/v1/housekeeping/tasks').send({
      roomId: room.roomId,
      taskType: 'CLEANING',
      notes: 'Integration housekeeping test',
    });
    expect(created.status).toBe(201);
    const taskId = created.body.data.id as string;
    createdTaskIds.push(taskId);
    expect(created.body.data.status).toBe('PENDING');
    expect(created.body.data.checklist.length).toBeGreaterThan(0);

    const deniedVerify = await housekeeping.agent
      .post(`/api/v1/housekeeping/tasks/${taskId}/actions`)
      .send({ action: 'VERIFY' });
    expect(deniedVerify.status).toBe(403);

    const started = await housekeeping.agent
      .post(`/api/v1/housekeeping/tasks/${taskId}/actions`)
      .send({ action: 'START' });
    expect(started.status).toBe(200);
    expect(started.body.data.status).toBe('IN_PROGRESS');

    const completed = await housekeeping.agent
      .post(`/api/v1/housekeeping/tasks/${taskId}/actions`)
      .send({ action: 'COMPLETE' });
    expect(completed.status).toBe(200);
    expect(completed.body.data.status).toBe('COMPLETED');
    expect(
      completed.body.data.checklist.every((item: { isCompleted: boolean }) => item.isCompleted),
    ).toBe(true);

    const verified = await manager.agent
      .post(`/api/v1/housekeeping/tasks/${taskId}/actions`)
      .send({ action: 'VERIFY' });
    expect(verified.status).toBe(200);
    expect(verified.body.data.status).toBe('VERIFIED');
    expect(verified.body.data.verifiedAt).toBeTruthy();
  });
});

describe('maintenance workflow', () => {
  it('creates a blocking ticket and releases the block on resolution', async () => {
    const maintenance = await loginAs(DEMO_ACCOUNTS.maintenance);
    const room = await dormitoryOneRoom();

    const blockStart = new Date();
    blockStart.setUTCDate(blockStart.getUTCDate() + 30);
    blockStart.setUTCHours(0, 0, 0, 0);
    const blockEnd = new Date(blockStart.getTime() + 2 * 86_400_000);

    const created = await maintenance.agent.post('/api/v1/maintenance/tickets').send({
      roomId: room.roomId,
      category: 'PLUMBING',
      priority: 'HIGH',
      description: 'Keran kamar mandi bocor — integration test',
      blocksInventory: true,
      blockStartAt: blockStart.toISOString(),
      blockEndAt: blockEnd.toISOString(),
    });
    expect(created.status).toBe(201);
    const ticketId = created.body.data.id as string;
    createdTicketIds.push(ticketId);
    expect(created.body.data.status).toBe('OPEN');
    expect(created.body.data.blocksInventory).toBe(true);

    const block = await prisma.inventoryBlock.findFirst({ where: { sourceTicketId: ticketId } });
    expect(block).toBeTruthy();
    expect(block!.blockType).toBe('MAINTENANCE');

    const invalid = await maintenance.agent
      .patch(`/api/v1/maintenance/tickets/${ticketId}`)
      .send({ status: 'CLOSED' });
    expect(invalid.status).toBe(403);

    const inProgress = await maintenance.agent
      .patch(`/api/v1/maintenance/tickets/${ticketId}`)
      .send({ status: 'IN_PROGRESS' });
    expect(inProgress.status).toBe(200);
    expect(inProgress.body.data.status).toBe('IN_PROGRESS');

    const resolved = await maintenance.agent
      .patch(`/api/v1/maintenance/tickets/${ticketId}`)
      .send({ status: 'RESOLVED', resolutionNotes: 'Keran diganti, pengujian selesai.' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.data.status).toBe('RESOLVED');
    expect(resolved.body.data.resolvedAt).toBeTruthy();

    const released = await prisma.inventoryBlock.findFirst({ where: { sourceTicketId: ticketId } });
    if (released) {
      expect(released.startAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(released.endAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    }
  });
});

describe('roster sync', () => {
  it('previews and syncs deterministically with idempotent reruns', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);

    const preview = await admin.agent
      .post('/api/v1/roster/preview')
      .send({ startDate: rosterDate, days: 2 });
    expect(preview.status).toBe(200);
    expect(preview.body.data.provider).toBe('MOCK_ROSTER');
    expect(preview.body.data.wouldFetch).toBeGreaterThan(0);
    expect(preview.body.data.alreadyPresent).toBe(0);

    const first = await admin.agent
      .post('/api/v1/roster/sync')
      .send({ startDate: rosterDate, days: 2 });
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('SUCCEEDED');
    expect(first.body.data.createdCount).toBeGreaterThan(0);
    createdRosterRunIds.push(first.body.data.id);

    const second = await admin.agent
      .post('/api/v1/roster/sync')
      .send({ startDate: rosterDate, days: 2 });
    expect(second.status).toBe(200);
    expect(second.body.data.createdCount).toBe(0);
    expect(second.body.data.unchangedCount).toBe(first.body.data.createdCount);
    createdRosterRunIds.push(second.body.data.id);

    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const forbidden = await manager.agent
      .post('/api/v1/roster/sync')
      .send({ startDate: rosterDate, days: 1 });
    expect(forbidden.status).toBe(403);

    const assignments = await admin.agent.get(
      `/api/v1/roster/assignments?from=${rosterDate}&to=${rosterDate}&pageSize=5`,
    );
    expect(assignments.status).toBe(200);
    expect(assignments.body.data.integrationStatus).toBe('MOCK');
    expect(assignments.body.data.items.length).toBeGreaterThan(0);
  });

  it('labels seeded roster rows as mock provenance', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const from = new Date();
    const to = new Date();
    to.setUTCDate(to.getUTCDate() + 4);
    const seeded = await admin.agent.get(
      `/api/v1/roster/assignments?from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}&pageSize=200`,
    );
    expect(seeded.status).toBe(200);
    expect(seeded.body.data.items.length).toBeGreaterThan(0);
    expect(seeded.body.data.integrationStatus).toBe('MOCK');
  });
});

describe('reports and settings', () => {
  it('serves occupancy reports to management and denies self-scoped roles', async () => {
    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const crew = await loginAs(DEMO_ACCOUNTS.crew);

    const occupancy = await manager.agent.get('/api/v1/reports/occupancy');
    expect(occupancy.status).toBe(200);
    expect(occupancy.body.data.totals.totalBeds).toBeGreaterThan(0);
    expect(Array.isArray(occupancy.body.data.items)).toBe(true);

    const crewReport = await crew.agent.get('/api/v1/reports/occupancy');
    expect(crewReport.status).toBe(403);

    const exportResponse = await manager.agent.get('/api/v1/reports/export?type=occupancy');
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers['content-type']).toContain('text/csv');
    expect(exportResponse.text).toContain('Dormitory');

    const xlsxResponse = await manager.agent
      .get('/api/v1/reports/export?type=occupancy&format=xlsx')
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(xlsxResponse.status).toBe(200);
    expect(xlsxResponse.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(xlsxResponse.headers['content-disposition']).toContain('.xlsx');
    const workbook = xlsxResponse.body as Buffer;
    expect(workbook.subarray(0, 2).toString('utf8')).toBe('PK');

    const crewExport = await crew.agent.get('/api/v1/reports/export?type=reservations');
    expect(crewExport.status).toBe(403);
  });

  it('persists settings and surfaces pending decisions', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);

    const before = await admin.agent.get('/api/v1/settings');
    expect(before.status).toBe(200);
    const readiness = before.body.data.items.find(
      (item: { key: string }) => item.key === 'availability.readinessWindowHours',
    );
    expect(readiness.pendingDecision).toContain('D-008');
    const emailSetting = before.body.data.items.find(
      (item: { key: string }) => item.key === 'notifications.emailEnabled',
    );
    const originalValue = emailSetting.value as boolean;

    const updated = await admin.agent
      .patch('/api/v1/settings')
      .send({ settings: [{ key: 'notifications.emailEnabled', value: !originalValue }] });
    expect(updated.status).toBe(200);
    const changed = updated.body.data.items.find(
      (item: { key: string }) => item.key === 'notifications.emailEnabled',
    );
    expect(changed.value).toBe(!originalValue);
    expect(changed.source).toBe('DATABASE');

    await admin.agent
      .patch('/api/v1/settings')
      .send({ settings: [{ key: 'notifications.emailEnabled', value: originalValue }] });

    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const denied = await crew.agent.get('/api/v1/settings');
    expect(denied.status).toBe(403);
  });
});

describe('notifications', () => {
  it('lists notifications for the signed-in user and marks them read', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const list = await crew.agent.get('/api/v1/notifications?page=1&pageSize=5');
    expect(list.status).toBe(200);
    expect(list.body.data.pagination).toMatchObject({ page: 1, pageSize: 5 });

    const first = list.body.data.items[0];
    if (first) {
      const read = await crew.agent.post(`/api/v1/notifications/${first.id}/read`);
      expect(read.status).toBe(200);
      expect(read.body.data.read).toBe(true);
    }

    const readAll = await crew.agent.post('/api/v1/notifications/read-all');
    expect(readAll.status).toBe(200);
    expect(typeof readAll.body.data.updated).toBe('number');
  });

  it('exposes mock delivery records only to notification administrators', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const crew = await loginAs(DEMO_ACCOUNTS.crew);

    const deliveries = await admin.agent.get('/api/v1/admin/notification-deliveries?pageSize=5');
    expect(deliveries.status).toBe(200);
    expect(deliveries.body.data.deliveryMode).toBe('MOCK');
    expect(Array.isArray(deliveries.body.data.items)).toBe(true);

    const denied = await crew.agent.get('/api/v1/admin/notification-deliveries');
    expect(denied.status).toBe(403);
  });
});
