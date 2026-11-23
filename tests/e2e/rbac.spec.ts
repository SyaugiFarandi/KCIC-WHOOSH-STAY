import { expect, test } from '@playwright/test';
import { crewLogin, loginAsDemo } from './helpers.js';

test.describe('server-side authorization', () => {
  test('denies crew API access to administration endpoints', async ({ page }) => {
    await loginAsDemo(page, crewLogin);

    const users = await page.request.get('/api/v1/admin/users');
    expect(users.status()).toBe(403);
    const payload = (await users.json()) as { error?: { code?: string } };
    expect(payload.error?.code).toBe('FORBIDDEN');

    const employees = await page.request.get('/api/v1/employees');
    expect(employees.status()).toBe(403);

    const audit = await page.request.get('/api/v1/admin/audit-logs');
    expect(audit.status()).toBe(403);

    const reports = await page.request.get('/api/v1/reports/occupancy');
    expect(reports.status()).toBe(403);

    const roster = await page.request.get('/api/v1/roster/assignments');
    expect(roster.status()).toBe(403);

    const settings = await page.request.get('/api/v1/settings');
    expect(settings.status()).toBe(403);
  });

  test('scopes crew dashboard data to zero global counts', async ({ page }) => {
    await loginAsDemo(page, crewLogin);

    const overview = await page.request.get('/api/v1/dashboard/overview');
    expect(overview.status()).toBe(200);
    const payload = (await overview.json()) as {
      data: { counts: { users: number }; integrations: { employeeSync: string } };
    };
    expect(payload.data.counts.users).toBe(0);
    expect(payload.data.integrations.employeeSync).toBe('MOCK');
  });
});
