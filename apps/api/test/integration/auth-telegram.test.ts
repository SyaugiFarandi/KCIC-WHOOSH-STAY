import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../../src/lib/prisma.js';
import { app, DEMO_ACCOUNTS, loginAs } from './helpers.js';

describe('telegram chat binding', () => {
  it('binds, reads and removes the chat id for the current user', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.crew);
    const userId = body.data.user.id;

    try {
      const initial = await agent.get('/api/v1/auth/me/telegram');
      expect(initial.status).toBe(200);
      expect(initial.body.data).toHaveProperty('telegramChatId');

      const invalid = await agent.put('/api/v1/auth/me/telegram').send({ chatId: 'bukan-angka' });
      expect(invalid.status).toBe(400);

      const saved = await agent.put('/api/v1/auth/me/telegram').send({ chatId: '123456789' });
      expect(saved.status).toBe(200);
      expect(saved.body.data.telegramChatId).toBe('123456789');

      const stored = await prisma.user.findUnique({ where: { id: userId } });
      expect(stored?.telegramChatId).toBe('123456789');

      const audit = await prisma.auditLog.findFirst({
        where: { action: 'USER_TELEGRAM_CHAT_UPDATED', entityId: userId },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit?.afterData).toEqual({ telegramLinked: true });

      const readBack = await agent.get('/api/v1/auth/me/telegram');
      expect(readBack.body.data.telegramChatId).toBe('123456789');

      const cleared = await agent.put('/api/v1/auth/me/telegram').send({ chatId: null });
      expect(cleared.status).toBe(200);
      expect(cleared.body.data.telegramChatId).toBeNull();
    } finally {
      await prisma.user.update({ where: { id: userId }, data: { telegramChatId: null } });
    }
  });

  it('requires an authenticated session', async () => {
    const read = await request(app).get('/api/v1/auth/me/telegram');
    expect(read.status).toBe(401);

    const write = await request(app).put('/api/v1/auth/me/telegram').send({ chatId: '123456789' });
    expect(write.status).toBe(401);
  });
});
