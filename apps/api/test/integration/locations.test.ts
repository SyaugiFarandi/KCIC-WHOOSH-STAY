import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const createdLocationCodes: string[] = [];
const createdDormitoryCodes: string[] = [];

afterEach(async () => {
  if (createdDormitoryCodes.length > 0) {
    await prisma.dormitory.deleteMany({
      where: { code: { in: createdDormitoryCodes }, reservations: { none: {} } },
    });
    createdDormitoryCodes.length = 0;
  }
  if (createdLocationCodes.length > 0) {
    await prisma.location.deleteMany({
      where: { code: { in: createdLocationCodes }, dormitories: { none: {} } },
    });
    createdLocationCodes.length = 0;
  }
});

describe('location master API', () => {
  it('seeds the five verified operational locations without duplicates', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await agent.get('/api/v1/master-data/locations?pageSize=100');
    expect(response.status).toBe(200);
    const codes = response.body.data.items.map((item: { code: string }) => item.code);
    for (const code of ['HALIM', 'KARAWANG', 'PADALARANG', 'TEGALLUAR', 'DEPO-501']) {
      expect(codes.filter((item: string) => item === code)).toHaveLength(1);
    }
    const halim = response.body.data.items.find((item: { code: string }) => item.code === 'HALIM');
    expect(halim).toMatchObject({ name: 'Halim', status: 'ACTIVE', address: null });

    const search = await agent.get('/api/v1/master-data/locations?q=karawang');
    expect(search.status).toBe(200);
    expect(search.body.data.items).toHaveLength(1);
    expect(search.body.data.items[0].code).toBe('KARAWANG');
  });

  it('creates, updates and deactivates a location with audit trail', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.admin);
    const code = `E2E-LOC-${Date.now()}`;
    createdLocationCodes.push(code);

    const created = await agent.post('/api/v1/master-data/locations').send({
      code,
      name: 'E2E Location',
      description: 'Created by automated test',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ code, status: 'ACTIVE', address: null });
    const id = created.body.data.id as string;

    const duplicate = await agent.post('/api/v1/master-data/locations').send({
      code: code.toLowerCase(),
      name: 'Duplicate code',
    });
    expect(duplicate.status).toBe(409);

    const updated = await agent.patch(`/api/v1/master-data/locations/${id}`).send({
      name: 'E2E Location Updated',
    });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('E2E Location Updated');

    const archived = await agent.patch(`/api/v1/master-data/locations/${id}`).send({
      status: 'INACTIVE',
    });
    expect(archived.status).toBe(200);
    expect(archived.body.data.status).toBe('INACTIVE');

    const audit = await agent.get(
      `/api/v1/admin/audit-logs?actorUserId=${body.data.user.id}&action=LOCATION_CREATE&pageSize=50`,
    );
    expect(audit.status).toBe(200);
    const entry = audit.body.data.items.find(
      (item: { entityId: string }) => item.entityId === id,
    );
    expect(entry).toBeTruthy();
    expect(entry.entityType).toBe('LOCATION');
  });

  it('blocks deactivation while active dormitories are linked and validates links', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const locationCode = `E2E-LOC-${Date.now()}`;
    const dormitoryCode = `E2E-DORM-${Date.now()}`;
    createdLocationCodes.push(locationCode);
    createdDormitoryCodes.push(dormitoryCode);

    const location = await agent.post('/api/v1/master-data/locations').send({
      code: locationCode,
      name: 'E2E Link Location',
    });
    expect(location.status).toBe(201);
    const locationId = location.body.data.id as string;

    const invalidLink = await agent.post('/api/v1/dormitories').send({
      code: dormitoryCode,
      name: 'E2E Link Dormitory',
      locationId: '00000000-0000-4000-8000-000000000000',
    });
    expect(invalidLink.status).toBe(400);

    const dormitory = await agent.post('/api/v1/dormitories').send({
      code: dormitoryCode,
      name: 'E2E Link Dormitory',
      locationId,
    });
    expect(dormitory.status).toBe(201);
    expect(dormitory.body.data).toMatchObject({
      locationId,
      locationName: 'E2E Link Location',
    });
    const dormitoryId = dormitory.body.data.id as string;

    const blocked = await agent.patch(`/api/v1/master-data/locations/${locationId}`).send({
      status: 'INACTIVE',
    });
    expect(blocked.status).toBe(409);

    const unlink = await agent.patch(`/api/v1/dormitories/${dormitoryId}`).send({
      locationId: null,
    });
    expect(unlink.status).toBe(200);
    expect(unlink.body.data.locationId).toBeNull();

    const archived = await agent.patch(`/api/v1/master-data/locations/${locationId}`).send({
      status: 'INACTIVE',
    });
    expect(archived.status).toBe(200);
  });

  it('enforces read access for operational roles and manage only for global managers', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const crewList = await crew.agent.get('/api/v1/master-data/locations');
    expect(crewList.status).toBe(200);
    const crewCreate = await crew.agent.post('/api/v1/master-data/locations').send({
      code: `E2E-DENIED-${Date.now()}`,
      name: 'Should not exist',
    });
    expect(crewCreate.status).toBe(403);

    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const managerCreate = await manager.agent.post('/api/v1/master-data/locations').send({
      code: `E2E-DENIED-${Date.now()}`,
      name: 'Should not exist',
    });
    expect(managerCreate.status).toBe(403);

    const frontdesk = await loginAs(DEMO_ACCOUNTS.frontdesk);
    const frontdeskCreate = await frontdesk.agent.post('/api/v1/master-data/locations').send({
      code: `E2E-DENIED-${Date.now()}`,
      name: 'Should not exist',
    });
    expect(frontdeskCreate.status).toBe(403);
  });

  it('exports locations as Excel for global scope only', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await admin.agent.get('/api/v1/master-data/export?entity=locations');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain('whoosh-stay-locations-');

    const frontdesk = await loginAs(DEMO_ACCOUNTS.frontdesk);
    const denied = await frontdesk.agent.get('/api/v1/master-data/export?entity=locations');
    expect([401, 403]).toContain(denied.status);
  });
});

describe('reservation statuses filter (D-045)', () => {
  it('filters by multiple terminal statuses and keeps single status precedence', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const history = await agent.get(
      '/api/v1/reservations?statuses=CHECKED_OUT,CANCELLED&pageSize=100',
    );
    expect(history.status).toBe(200);
    expect(history.body.data.items.length).toBeGreaterThan(0);
    for (const item of history.body.data.items) {
      expect(['CHECKED_OUT', 'CANCELLED']).toContain(item.status);
    }

    const precedence = await agent.get(
      '/api/v1/reservations?status=CONFIRMED&statuses=CHECKED_OUT&pageSize=100',
    );
    expect(precedence.status).toBe(200);
    for (const item of precedence.body.data.items) {
      expect(item.status).toBe('CONFIRMED');
    }

    const invalid = await agent.get('/api/v1/reservations?statuses=BOGUS_STATUS&pageSize=1');
    expect(invalid.status).toBe(200);

    const invalidPagination = await agent.get(
      '/api/v1/reservations?statuses=CHECKED_OUT,CANCELLED&page=0',
    );
    expect(invalidPagination.status).toBe(400);
  });
});
