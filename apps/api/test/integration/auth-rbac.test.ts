import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEMO_ACCOUNTS, app, loginAs } from './helpers.js';

const DEMO_PASSWORD = 'WhooshDemo!2026';

describe('authentication and session handling', () => {
  it('signs in a demo account with username and password', async () => {
    const agent = request.agent(app);
    const response = await agent
      .post('/api/v1/auth/demo-login')
      .send({ username: 'crew', password: DEMO_PASSWORD });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => /HttpOnly/i.test(cookie))).toBe(true);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(DEMO_ACCOUNTS.crew);
  });

  it('rejects wrong passwords and unknown usernames with the same message', async () => {
    const wrongPassword = await request(app)
      .post('/api/v1/auth/demo-login')
      .send({ username: 'crew', password: 'not-the-password' });
    const unknownUser = await request(app)
      .post('/api/v1/auth/demo-login')
      .send({ username: 'ghost', password: DEMO_PASSWORD });

    for (const response of [wrongPassword, unknownUser]) {
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe('AUTH_REQUIRED');
      expect(response.body.error.message).toContain('Username atau password salah');
    }
  });

  it('refuses demo login for non-demo domains', async () => {
    const response = await request(app)
      .post('/api/v1/auth/demo-login')
      .send({ username: 'someone@example.test', password: DEMO_PASSWORD });
    expect(response.status).toBe(401);
  });

  it('rejects anonymous access with a typed error envelope', async () => {
    const response = await request(app).get('/api/v1/auth/me');
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'AUTH_REQUIRED' },
      meta: { requestId: expect.any(String) },
    });
  });

  it('creates an HttpOnly session cookie on demo login', async () => {
    const agent = request.agent(app);
    const response = await agent
      .post('/api/v1/auth/dev-login')
      .send({ email: DEMO_ACCOUNTS.admin });

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((cookie) => cookie.startsWith('whoosh_stay_session='))).toBe(true);
    expect(cookies.some((cookie) => /HttpOnly/i.test(cookie))).toBe(true);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(DEMO_ACCOUNTS.admin);
    expect(me.body.data.roles.some((role: { roleCode: string }) => role.roleCode === 'SYSTEM_ADMIN')).toBe(
      true,
    );
    expect(me.body.data.permissions.length).toBeGreaterThan(40);
    expect(me.body.data.session.authMode).toBe('mock');
  });

  it('rejects state-changing requests from an unapproved origin', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);

    const blocked = await admin.agent
      .post('/api/v1/notifications/read-all')
      .set('Origin', 'https://evil.example');
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('FORBIDDEN');

    const allowed = await admin.agent
      .post('/api/v1/notifications/read-all')
      .set('Origin', 'http://localhost:5174');
    expect(allowed.status).toBe(200);
  });

  it('rejects unknown demo accounts without revealing details', async () => {
    const response = await request(app)
      .post('/api/v1/auth/dev-login')
      .send({ email: 'unknown@demo.whoosh-stay.local' });
    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ success: false, error: { code: 'AUTH_REQUIRED' } });
  });

  it('invalidates the session on logout', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.crew);
    const logout = await agent.post('/api/v1/auth/logout');
    expect(logout.status).toBe(200);

    const me = await agent.get('/api/v1/auth/me');
    expect(me.status).toBe(401);
  });
});

describe('role-based access control', () => {
  it('allows administrators to read user administration data', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const users = await agent.get('/api/v1/admin/users?pageSize=5');
    expect(users.status).toBe(200);
    expect(users.body.success).toBe(true);
    expect(users.body.data.items.length).toBe(5);
    expect(users.body.data.pagination.total).toBeGreaterThanOrEqual(10);

    const roles = await agent.get('/api/v1/admin/roles');
    expect(roles.status).toBe(200);
    expect(roles.body.data.items).toHaveLength(8);

    const permissions = await agent.get('/api/v1/admin/permissions');
    expect(permissions.status).toBe(200);
    expect(permissions.body.data.permissions.length).toBeGreaterThan(40);
  });

  it('denies crew access to administration, employees and audit routes', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.crew);

    const adminUsers = await agent.get('/api/v1/admin/users');
    expect(adminUsers.status).toBe(403);
    expect(adminUsers.body.error.code).toBe('FORBIDDEN');

    const employees = await agent.get('/api/v1/employees');
    expect(employees.status).toBe(403);

    const audit = await agent.get('/api/v1/admin/audit-logs');
    expect(audit.status).toBe(403);
  });

  it('scopes dashboard counts for non-global roles', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.crew);
    const response = await agent.get('/api/v1/dashboard/overview');
    expect(response.status).toBe(200);
    expect(response.body.data.counts.users).toBe(0);
    expect(response.body.data.integrations.authMode).toBe('mock');
  });

  it('allows auditors read-only access while denying writes', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.auditor);

    const audit = await agent.get('/api/v1/admin/audit-logs?pageSize=5');
    expect(audit.status).toBe(200);
    expect(Array.isArray(audit.body.data.items)).toBe(true);

    const users = await agent.get('/api/v1/admin/users?pageSize=5');
    expect(users.status).toBe(200);

    const roleChange = await agent
      .put(`/api/v1/admin/users/${body.data.user.id}/roles`)
      .send({ assignments: [] });
    expect(roleChange.status).toBe(403);
    expect(roleChange.body.error.message).toContain('roles.manage');
  });

  it('allows managers to read the employee directory', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.manager);
    const employees = await agent.get('/api/v1/employees?pageSize=5');
    expect(employees.status).toBe(200);
    expect(employees.body.data.items.length).toBeGreaterThan(0);
  });
});
