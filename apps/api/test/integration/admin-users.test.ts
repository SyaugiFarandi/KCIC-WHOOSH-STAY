import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

describe('user administration', () => {
  it('supports search, filters and scope options', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const search = await agent.get('/api/v1/admin/users?q=crew&pageSize=20');
    expect(search.status).toBe(200);
    expect(search.body.data.items.length).toBeGreaterThanOrEqual(2);

    const filtered = await agent.get('/api/v1/admin/users?role=AUDITOR');
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.items).toHaveLength(1);
    expect(filtered.body.data.items[0].email).toBe(DEMO_ACCOUNTS.auditor);

    const options = await agent.get('/api/v1/admin/scope-options');
    expect(options.status).toBe(200);
    expect(options.body.data.dormitories[0]).toMatchObject({
      id: expect.any(String),
      code: expect.any(String),
      name: expect.any(String),
    });
    expect(options.body.data.buildings.length).toBeGreaterThan(0);

    const invalidFilter = await agent.get('/api/v1/admin/users?role=NOT_A_ROLE');
    expect(invalidFilter.status).toBe(400);
    expect(invalidFilter.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects duplicate and malformed role assignments', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const options = await agent.get('/api/v1/admin/scope-options');
    const dormitoryId = options.body.data.dormitories[0].id as string;

    const users = await agent.get(`/api/v1/admin/users?q=${DEMO_ACCOUNTS.crew2}`);
    const crewTwoId = users.body.data.items[0].id as string;

    const duplicate = await agent.put(`/api/v1/admin/users/${crewTwoId}/roles`).send({
      assignments: [
        { roleCode: 'CREW', scopeType: 'SELF' },
        { roleCode: 'CREW', scopeType: 'SELF' },
      ],
    });
    expect(duplicate.status).toBe(400);

    const adminWithScopedRole = await agent.put(`/api/v1/admin/users/${crewTwoId}/roles`).send({
      assignments: [
        {
          roleCode: 'SYSTEM_ADMIN',
          scopeType: 'DORMITORY',
          scopeId: dormitoryId,
        },
      ],
    });
    expect(adminWithScopedRole.status).toBe(400);
    expect(JSON.stringify(adminWithScopedRole.body.error.details)).toMatch(/SYSTEM_ADMIN/);
  });

  it('prevents self-service privilege changes and self deactivation', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.admin);
    const adminId = body.data.user.id as string;

    const selfRoles = await agent.put(`/api/v1/admin/users/${adminId}/roles`).send({
      assignments: [{ roleCode: 'SYSTEM_ADMIN', scopeType: 'GLOBAL' }],
    });
    expect(selfRoles.status).toBe(403);

    const selfStatus = await agent
      .patch(`/api/v1/admin/users/${adminId}`)
      .send({ status: 'DISABLED' });
    expect(selfStatus.status).toBe(403);

    const invalidStatus = await agent
      .patch(`/api/v1/admin/users/${adminId}`)
      .send({ status: 'ZOMBIE' });
    expect(invalidStatus.status).toBe(400);
  });
});
