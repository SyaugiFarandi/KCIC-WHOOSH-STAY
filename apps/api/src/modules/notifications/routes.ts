import { Router } from 'express';
import { z } from 'zod';
import { notificationDeliveryQuerySchema, paginationQuerySchema } from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { requireAuth, requirePermission } from '../auth/middleware.js';
import { ForbiddenError, NotFoundError } from '../../middleware/errors.js';
import { deliveryModeLabel } from './providers/index.js';

export const notificationsRouter = Router();

notificationsRouter.get('/notifications', requireAuth, async (req, res) => {
  const query = validate(paginationQuerySchema, req.query);
  const unreadOnly = req.query.unread === 'true';
  const userId = req.auth!.user.id;
  const where = { userId, ...(unreadOnly ? { readAt: null } : {}) };
  const [total, unread, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { userId, readAt: null } }),
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);
  const pagination = paginationMeta(total, query.page, query.pageSize);
  sendSuccess(
    res,
    {
      items: items.map((item) => ({
        id: item.id,
        eventCode: item.eventCode,
        title: item.title,
        body: item.body,
        readAt: item.readAt?.toISOString() ?? null,
        referenceType: item.referenceType,
        referenceId: item.referenceId,
        createdAt: item.createdAt.toISOString(),
      })),
      unread,
      pagination,
    },
    { pagination },
  );
});

notificationsRouter.post('/notifications/:id/read', requireAuth, async (req, res) => {
  const id = validate(z.uuid(), req.params.id);
  const notification = await prisma.notification.findFirst({
    where: { id, userId: req.auth!.user.id },
  });
  if (!notification) throw new NotFoundError('Notification not found');
  const updated = await prisma.notification.update({
    where: { id },
    data: { readAt: notification.readAt ?? new Date() },
  });
  sendSuccess(res, { read: true, readAt: updated.readAt?.toISOString() ?? null });
});

notificationsRouter.post('/notifications/read-all', requireAuth, async (req, res) => {
  const result = await prisma.notification.updateMany({
    where: { userId: req.auth!.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  sendSuccess(res, { updated: result.count });
});

notificationsRouter.get(
  '/admin/notification-deliveries',
  requirePermission('notifications.manage'),
  async (req, res) => {
    if (!req.access!.global) {
      throw new ForbiddenError('Notification delivery logs are limited to global administrators');
    }
    const query = validate(paginationQuerySchema, req.query);
    const filters = validate(notificationDeliveryQuerySchema, req.query);
    const where = {
      ...(filters.channel ? { channel: filters.channel } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.notificationDelivery.count({ where }),
      prisma.notificationDelivery.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const pagination = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(
      res,
      {
        items: items.map((item) => ({
          id: item.id,
          channel: item.channel,
          recipient: item.recipient,
          status: item.status,
          providerMessageId: item.providerMessageId,
          attemptCount: item.attemptCount,
          sentAt: item.sentAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        })),
        pagination,
        deliveryMode: deliveryModeLabel(),
      },
      { pagination },
    );
  },
);
