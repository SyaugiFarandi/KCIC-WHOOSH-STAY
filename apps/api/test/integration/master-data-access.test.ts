import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const createdCodes: string[] = [];

afterEach(async () => {
  if (createdCodes.length === 0) return;
  await prisma.roomType.deleteMany({
    where: { code: { in: createdCodes }, rooms: { none: {} } },
  });
  createdCodes.length = 0;
});

describe('master data API', () => {
  it('lists room types, facilities and organization reference data', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const roomTypes = await agent.get('/api/v1/master-data/room-types?pageSize=50');
    expect(roomTypes.status).toBe(200);
    expect(roomTypes.body.data.items.length).toBeGreaterThanOrEqual(2);
    expect(roomTypes.body.data.pagination.total).toBeGreaterThanOrEqual(2);

    const search = await agent.get('/api/v1/master-data/room-types?q=standar');
    expect(search.status).toBe(200);
    expect(search.body.data.items.some((item: { code: string }) => item.code === 'DEMO-STD')).toBe(
      true,
    );

    const facilities = await agent.get('/api/v1/master-data/facilities');
    expect(facilities.status).toBe(200);
    expect(Array.isArray(facilities.body.data.items)).toBe(true);

    const buildings = await agent.get('/api/v1/master-data/buildings');
    expect(buildings.status).toBe(200);
    expect(buildings.body.data.items.length).toBeGreaterThan(0);

    const organization = await agent.get('/api/v1/master-data/organization');
    expect(organization.status).toBe(200);
    expect(organization.body.data).toMatchObject({
      readOnly: true,
      sourceSystem: 'DEMO',
    });
    expect(organization.body.data.departments.length).toBeGreaterThan(0);
  });

  it('creates, updates and archives a room type with audit trail', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.admin);
    const code = `E2E-MD-${Date.now()}`;
    createdCodes.push(code);

    const created = await agent.post('/api/v1/master-data/room-types').send({
      code,
      name: 'E2E Master Data Room',
      defaultCapacity: 3,
      description: 'Created by automated test',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code, status: 'ACTIVE' });
    const id = created.body.data.id as string;

    const duplicate = await agent.post('/api/v1/master-data/room-types').send({
      code,
      name: 'Duplicate code',
    });
    expect(duplicate.status).toBeGreaterThanOrEqual(400);

    const updated = await agent.patch(`/api/v1/master-data/room-types/${id}`).send({
      name: 'E2E Master Data Room Updated',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('E2E Master Data Room Updated');

    const archived = await agent.patch(`/api/v1/master-data/room-types/${id}`).send({
      status: 'INACTIVE',
    });
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('INACTIVE');

    const audit = await agent.get(
      `/api/v1/admin/audit-logs?actorUserId=${body.data.user.id}&action=ROOM_TYPE_CREATE&pageSize=50`,
    );
    expect(audit.status).toBe(200);
    const entry = audit.body.data.items.find(
      (item: { entityId: string }) => item.entityId === id,
    );
    expect(entry).toBeTruthy();

    const detail = await agent.get(`/api/v1/admin/audit-logs/${entry.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      action: 'ROOM_TYPE_CREATE',
      entityType: 'ROOM_TYPE',
      entityId: id,
    });
    expect(detail.body.data.afterData).toMatchObject({ code });
  });

  it('enforces permissions and validates pagination input', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);

    const deniedCreate = await crew.agent.post('/api/v1/master-data/room-types').send({
      code: `E2E-DENIED-${Date.now()}`,
      name: 'Should not exist',
    });
    expect([401, 403]).toContain(deniedCreate.status);

    const deniedExport = await crew.agent.get('/api/v1/master-data/export?entity=rooms');
    expect([401, 403]).toContain(deniedExport.status);

    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const invalidPage = await admin.agent.get('/api/v1/master-data/rooms?page=0');
    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('streams an Excel export for permitted administrators', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await agent.get('/api/v1/master-data/export?entity=room-types');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain('whoosh-stay-room-types-');
    expect(Number(response.headers['content-length'])).toBeGreaterThan(1000);
  });
});

describe('user bulk status and notification read state', () => {
  it('validates bulk requests and blocks self deactivation', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.admin);

    const empty = await agent.post('/api/v1/admin/users/bulk-status').send({
      userIds: [],
      status: 'ACTIVE',
    });
    expect(empty.status).toBe(400);

    const self = await agent.post('/api/v1/admin/users/bulk-status').send({
      userIds: [body.data.user.id],
      status: 'DISABLED',
    });
    expect(self.status).toBe(403);
  });

  it('returns unread-only notifications and updates read state', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.crew);

    const unread = await agent.get('/api/v1/notifications?unread=true&pageSize=50');
    expect(unread.status).toBe(200);
    expect(unread.body.data.items.every((item: { readAt: string | null }) => item.readAt === null)).toBe(
      true,
    );
    expect(unread.body.data.unread).toBe(unread.body.data.items.length);

    if (unread.body.data.items.length > 0) {
      const target = unread.body.data.items[0].id as string;
      const markRead = await agent.post(`/api/v1/notifications/${target}/read`);
      expect(markRead.status).toBe(200);

      const after = await agent.get('/api/v1/notifications?pageSize=1');
      expect(after.body.data.unread).toBe(unread.body.data.unread - 1);
    }
  });
});
