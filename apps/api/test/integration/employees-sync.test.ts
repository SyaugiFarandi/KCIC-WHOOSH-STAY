import { describe, expect, it } from 'vitest';
import { syncEmployees } from '../../src/modules/employees/service.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

describe('employee synchronization', () => {
  it('is idempotent across repeated runs', async () => {
    const first = await syncEmployees();
    expect(first.fetched).toBeGreaterThan(0);
    expect(first.status).toBe('SUCCEEDED');

    const second = await syncEmployees();
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(second.fetched);
    expect(second.failed).toBe(0);
    expect(second.status).toBe('SUCCEEDED');
  });

  it('exposes sync history to administrators only', async () => {
    const { agent: adminAgent } = await loginAs(DEMO_ACCOUNTS.admin);
    const runs = await adminAgent.get('/api/v1/admin/employees/sync-runs?pageSize=5');
    expect(runs.status).toBe(200);
    expect(runs.body.data.items.length).toBeGreaterThan(0);
    expect(runs.body.data.integrationStatus).toBe('MOCK');

    const { agent: crewAgent } = await loginAs(DEMO_ACCOUNTS.crew);
    const denied = await crewAgent.get('/api/v1/admin/employees/sync-runs');
    expect(denied.status).toBe(403);
  });
});
