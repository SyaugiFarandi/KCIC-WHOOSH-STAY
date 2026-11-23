import request from 'supertest';
import { expect } from 'vitest';
import type { AuthMe } from '@whoosh/shared';
import { createApp } from '../../src/app.js';

export const app = createApp();

export const DEMO_ACCOUNTS = {
  admin: 'admin@demo.whoosh-stay.local',
  manager: 'manager@demo.whoosh-stay.local',
  auditor: 'auditor@demo.whoosh-stay.local',
  crew: 'crew@demo.whoosh-stay.local',
  crew2: 'crew2@demo.whoosh-stay.local',
  frontdesk: 'frontdesk@demo.whoosh-stay.local',
  housekeeping: 'housekeeping@demo.whoosh-stay.local',
  maintenance: 'maintenance@demo.whoosh-stay.local',
} as const;

export async function loginAs(email: string) {
  const agent = request.agent(app);
  const response = await agent.post('/api/v1/auth/dev-login').send({ email });
  if (response.status !== 200) {
    throw new Error(`Demo login failed for ${email}: ${response.status} ${response.text}`);
  }
  return { agent, body: response.body as { success: true; data: AuthMe } };
}

export function expectSuccessEnvelope(body: unknown) {
  expect(body).toMatchObject({
    success: true,
    meta: { requestId: expect.any(String) },
  });
}
