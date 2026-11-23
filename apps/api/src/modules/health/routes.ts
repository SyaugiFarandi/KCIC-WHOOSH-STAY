import { Router } from 'express';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';

export const healthRouter = Router();

async function databaseStatus(): Promise<'up' | 'down'> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return 'up';
  } catch {
    return 'down';
  }
}

healthRouter.get('/health/live', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    service: 'whoosh-stay-api',
    time: new Date().toISOString(),
    environment: env.NODE_ENV,
  });
});

healthRouter.get('/health/ready', async (_req, res) => {
  const database = await databaseStatus();
  const ok = database === 'up';
  res.status(ok ? 200 : 503).json({
    success: ok,
    data: {
      status: ok ? 'ok' : 'degraded',
      service: 'whoosh-stay-api',
      time: new Date().toISOString(),
      checks: { database },
    },
    meta: { requestId: 'health' },
  });
});

healthRouter.get('/health', async (_req, res) => {
  const database = await databaseStatus();
  const ok = database === 'up';
  res.status(ok ? 200 : 503).json({
    success: ok,
    data: {
      status: ok ? 'ok' : 'degraded',
      service: 'whoosh-stay-api',
      time: new Date().toISOString(),
      checks: { database },
    },
    meta: { requestId: 'health' },
  });
});
