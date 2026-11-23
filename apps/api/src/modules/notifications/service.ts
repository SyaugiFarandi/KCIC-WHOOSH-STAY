import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { getDeliveryProvider } from './providers/index.js';
import type { DeliveryChannel, DeliveryResult } from './providers/types.js';

export interface NotificationInput {
  userId: string;
  eventCode: string;
  title: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
  channels?: Array<'EMAIL' | 'TELEGRAM'>;
}

async function channelEnabled(key: string): Promise<boolean> {
  const setting = await prisma.systemSetting.findUnique({ where: { key } });
  return setting?.value === true;
}

export async function createNotification(input: NotificationInput): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      eventCode: input.eventCode,
      title: input.title,
      body: input.body,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
    },
  });

  const user = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, telegramChatId: true },
  });
  if (!user) return;

  const channels: DeliveryChannel[] = [];
  if (input.channels?.includes('EMAIL') && (await channelEnabled('notifications.emailEnabled'))) {
    channels.push('EMAIL');
  }
  if (input.channels?.includes('TELEGRAM') && (await channelEnabled('notifications.telegramEnabled'))) {
    channels.push('TELEGRAM');
  }

  for (const channel of channels) {
    const provider = getDeliveryProvider(channel);
    if (!provider) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: notification.id,
          channel,
          recipient: channel === 'EMAIL' ? user.email : `telegram:${user.email}`,
          status: 'MOCK_DELIVERED',
          providerMessageId: `mock-${channel.toLowerCase()}-${notification.id.slice(0, 8)}`,
          attemptCount: 1,
          sentAt: new Date(),
        },
      });
      continue;
    }

    const recipient =
      channel === 'EMAIL' ? user.email : user.telegramChatId?.trim() || null;
    const result: DeliveryResult = recipient
      ? await provider.send({
          to: recipient,
          subject: input.title,
          text: input.body,
        })
      : {
          status: 'FAILED',
          providerMessageId: null,
          error: 'Chat ID Telegram belum ditautkan untuk pengguna ini.',
        };

    if (result.status === 'FAILED') {
      logger.warn(
        { eventCode: input.eventCode, channel, reason: result.error },
        'notification delivery failed',
      );
    }

    await prisma.notificationDelivery.create({
      data: {
        notificationId: notification.id,
        channel,
        recipient: recipient ?? `telegram:${user.email}`,
        status: result.status,
        providerMessageId: result.providerMessageId,
        attemptCount: 1,
        lastError: result.error,
        sentAt: result.status === 'SENT' ? new Date() : null,
      },
    });
  }
}

export async function notifyEmployees(
  employeeIds: string[],
  payload: Omit<NotificationInput, 'userId'>,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: { employeeId: { in: [...new Set(employeeIds)] }, status: 'ACTIVE' },
      select: { id: true },
    });
    await Promise.all(users.map((user) => createNotification({ ...payload, userId: user.id })));
  } catch (error) {
    logger.warn({ err: error, eventCode: payload.eventCode }, 'notification dispatch failed');
  }
}

export async function notifyDormitoryManagers(
  dormitoryId: string,
  payload: Omit<NotificationInput, 'userId'>,
): Promise<void> {
  try {
    const users = await prisma.user.findMany({
      where: {
        status: 'ACTIVE',
        roles: {
          some: {
            role: { code: { in: ['DORMITORY_MANAGER', 'DORMITORY_ADMIN', 'SYSTEM_ADMIN'] } },
            OR: [{ scopeType: 'GLOBAL' }, { scopeType: 'DORMITORY', scopeId: dormitoryId }],
          },
        },
      },
      select: { id: true },
    });
    await Promise.all(users.map((user) => createNotification({ ...payload, userId: user.id })));
  } catch (error) {
    logger.warn({ err: error, eventCode: payload.eventCode }, 'manager notification failed');
  }
}
