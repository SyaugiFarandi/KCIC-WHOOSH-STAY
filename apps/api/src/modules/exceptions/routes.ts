import { Router } from 'express';
import { z } from 'zod';
import {
  reservationExceptionAssignSchema,
  reservationExceptionListQuerySchema,
  reservationExceptionResolveSchema,
  type ReservationExceptionListResult,
} from '@whoosh/shared';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { requirePermission } from '../auth/middleware.js';
import {
  assignReservationException,
  getReservationException,
  listReservationExceptions,
  resolveReservationException,
} from './service.js';

export const exceptionsRouter = Router();

exceptionsRouter.get(
  '/exceptions',
  requirePermission('exceptions.read'),
  async (req, res) => {
    const query = validate(reservationExceptionListQuerySchema, req.query);
    const result = await listReservationExceptions(req.access!, query, req.auth!.user.id);
    const pagination = paginationMeta(result.total, query.page, query.pageSize);
    sendSuccess(
      res,
      {
        items: result.items,
        counts: result.counts,
        pagination,
      } satisfies ReservationExceptionListResult,
      { pagination },
    );
  },
);

exceptionsRouter.get(
  '/exceptions/:id',
  requirePermission('exceptions.read'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    sendSuccess(res, await getReservationException(id, req.access!));
  },
);

exceptionsRouter.patch(
  '/exceptions/:id/assign',
  requirePermission('exceptions.manage'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(reservationExceptionAssignSchema, req.body);
    const updated = await assignReservationException(
      id,
      input,
      { userId: req.auth!.user.id, ipAddress: req.ip, userAgent: req.get('user-agent') },
      req.access!,
    );
    sendSuccess(res, updated);
  },
);

exceptionsRouter.patch(
  '/exceptions/:id/resolve',
  requirePermission('exceptions.manage'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(reservationExceptionResolveSchema, req.body);
    const updated = await resolveReservationException(
      id,
      input,
      { userId: req.auth!.user.id, ipAddress: req.ip, userAgent: req.get('user-agent') },
      req.access!,
    );
    sendSuccess(res, updated);
  },
);
