import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { app } from './helpers.js';

describe('health endpoints', () => {
  it('reports liveness without authentication', async () => {
    const response = await request(app).get('/health/live');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok', service: 'whoosh-stay-api' },
      meta: { requestId: expect.any(String) },
    });
  });

  it('reports database readiness', async () => {
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('ok');
    expect(response.body.data.checks.database).toBe('up');
  });

  it('wraps database health checks with diagnostics', async () => {
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { checks: { database: 'up' } },
    });
  });

  it('returns a structured error envelope for unknown routes', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'NOT_FOUND' },
      meta: { requestId: expect.any(String) },
    });
  });
});
