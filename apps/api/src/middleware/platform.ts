import type { RequestHandler } from 'express';
import { randomUUID } from 'node:crypto';
import { ERROR_CODES } from '@whoosh/shared';
import { runWithRequestContext } from '../lib/context.js';

export const requestContext: RequestHandler = (req, res, next) => {
  const incoming = req.header('x-request-id');
  const requestId = incoming && /^[A-Za-z0-9._-]{8,100}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  runWithRequestContext({ requestId }, () => next());
};

export const cors: RequestHandler = (req, res, next) => {
  const origin = req.header('origin');
  const allowed = (process.env.WEB_ORIGIN ?? 'http://localhost:5174').split(',');
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
  if (origin && unsafe && !allowed.includes(origin)) {
    res.status(403).json({
      success: false,
      error: { code: ERROR_CODES.FORBIDDEN, message: 'Origin not allowed' },
      meta: { requestId: req.requestId },
    });
    return;
  }
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
};
