import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  SETTING_KEYS,
  updateSettingsSchema,
  upsertPolicySchema,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';

export const settingsRouter = Router();

const SETTING_METADATA: Record<
  (typeof SETTING_KEYS)[number],
  { defaultValue: Prisma.InputJsonValue; description: string; pendingDecision?: string }
> = {
  'reservation.defaultApprovalMode': {
    defaultValue: 'ADMIN_APPROVAL',
    description: 'Mode persetujuan default untuk reservasi baru (NOT_REQUIRED atau ADMIN_APPROVAL).',
  },
  'availability.readinessWindowHours': {
    defaultValue: 0,
    description:
      'Jendela waktu (jam) sebelum check-in di mana status housekeeping READY wajib dipenuhi. 0 berarti kebijakan belum diaktifkan.',
    pendingDecision: 'D-008 menunggu keputusan bisnis; jangan menganggap kebijakan 24 jam disetujui.',
  },
  'notifications.emailEnabled': {
    defaultValue: false,
    description: 'Mengaktifkan pengiriman notifikasi email melalui provider mock pengembangan.',
  },
  'notifications.telegramEnabled': {
    defaultValue: false,
    description: 'Mengaktifkan pengiriman notifikasi Telegram melalui provider mock pengembangan.',
  },
  'roster.autoConfirmEnabled': {
    defaultValue: false,
    description:
      'Mengizinkan konversi roster menjadi reservasi secara otomatis. Tetap tidak pernah mengubah reservasi terkonfirmasi.',
  },
};

function serializeSetting(
  key: (typeof SETTING_KEYS)[number],
  stored: { value: Prisma.JsonValue; updatedAt: Date; description: string | null } | null,
) {
  const metadata = SETTING_METADATA[key];
  return {
    key,
    value: stored ? (stored.value as string | number | boolean) : metadata.defaultValue,
    description: stored?.description ?? metadata.description,
    source: stored ? ('DATABASE' as const) : ('DEFAULT' as const),
    updatedAt: stored?.updatedAt.toISOString() ?? null,
    pendingDecision: metadata.pendingDecision ?? null,
  };
}

async function listSettings() {
  const stored = await prisma.systemSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  const byKey = new Map(stored.map((item) => [item.key, item]));
  return SETTING_KEYS.map((key) =>
    serializeSetting(key, byKey.get(key) ?? null),
  );
}

settingsRouter.get('/settings', requirePermission('settings.manage'), async (req, res) => {
  if (!req.access!.global) throw new ForbiddenError('Settings require a global scope');
  sendSuccess(res, { items: await listSettings() });
});

settingsRouter.patch('/settings', requirePermission('settings.manage'), async (req, res) => {
  if (!req.access!.global) throw new ForbiddenError('Settings require a global scope');
  const input = validate(updateSettingsSchema, req.body);
  const before = await prisma.systemSetting.findMany({
    where: { key: { in: input.settings.map((setting) => setting.key) } },
  });
  await prisma.$transaction(async (tx) => {
    for (const setting of input.settings) {
      const metadata = SETTING_METADATA[setting.key];
      await tx.systemSetting.upsert({
        where: { key: setting.key },
        create: {
          key: setting.key,
          value: setting.value,
          description: metadata.description,
          updatedBy: req.auth!.user.id,
        },
        update: {
          value: setting.value,
          updatedBy: req.auth!.user.id,
        },
      });
    }
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'SETTINGS_UPDATE',
    entityType: 'SYSTEM_SETTING',
    beforeData: Object.fromEntries(before.map((item) => [item.key, item.value])),
    afterData: Object.fromEntries(
      input.settings.map((item) => [item.key, item.value]),
    ) as Prisma.InputJsonObject,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, { items: await listSettings() });
});

function mapPolicy(policy: {
  id: string;
  code: string;
  name: string;
  priority: number;
  isActive: boolean;
  approvalMode: string;
  criteria: Prisma.JsonValue;
  rules: Prisma.JsonValue;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: policy.id,
    code: policy.code,
    name: policy.name,
    priority: policy.priority,
    isActive: policy.isActive,
    approvalMode: policy.approvalMode,
    criteria: policy.criteria as Record<string, unknown>,
    rules: policy.rules as Record<string, unknown>,
    effectiveFrom: policy.effectiveFrom?.toISOString().slice(0, 10) ?? null,
    effectiveTo: policy.effectiveTo?.toISOString().slice(0, 10) ?? null,
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

settingsRouter.get('/policies', requirePermission('policies.manage'), async (req, res) => {
  if (!req.access!.global) throw new ForbiddenError('Policies require a global scope');
  const items = await prisma.accommodationPolicy.findMany({
    orderBy: [{ priority: 'asc' }, { code: 'asc' }],
  });
  sendSuccess(res, { items: items.map(mapPolicy) });
});

settingsRouter.post('/policies', requirePermission('policies.manage'), async (req, res) => {
  if (!req.access!.global) throw new ForbiddenError('Policies require a global scope');
  const input = validate(upsertPolicySchema, req.body);
  const existing = await prisma.accommodationPolicy.findUnique({ where: { code: input.code } });
  const policy = await prisma.accommodationPolicy.upsert({
    where: { code: input.code },
    create: {
      code: input.code,
      name: input.name,
      priority: input.priority,
      isActive: input.isActive,
      approvalMode: input.approvalMode,
      criteria: input.criteria as Prisma.InputJsonValue,
      rules: input.rules as Prisma.InputJsonValue,
    },
    update: {
      name: input.name,
      priority: input.priority,
      isActive: input.isActive,
      approvalMode: input.approvalMode,
      criteria: input.criteria as Prisma.InputJsonValue,
      rules: input.rules as Prisma.InputJsonValue,
    },
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: existing ? 'POLICY_UPDATE' : 'POLICY_CREATE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: policy.id,
    beforeData: existing ? { name: existing.name, isActive: existing.isActive } : undefined,
    afterData: { code: policy.code, approvalMode: policy.approvalMode, isActive: policy.isActive },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, mapPolicy(policy), { status: existing ? 200 : 201 });
});

const updatePolicySchema = z.object({
  name: z.string().trim().min(2).max(150).optional(),
  priority: z.coerce.number().int().min(1).max(1000).optional(),
  isActive: z.boolean().optional(),
  approvalMode: z.enum(['NOT_REQUIRED', 'ADMIN_APPROVAL']).optional(),
  criteria: z.record(z.string(), z.unknown()).optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
});

settingsRouter.patch('/policies/:id', requirePermission('policies.manage'), async (req, res) => {
  if (!req.access!.global) throw new ForbiddenError('Policies require a global scope');
  const id = validate(z.uuid(), req.params.id);
  const existing = await prisma.accommodationPolicy.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Policy not found');
  const input = validate(updatePolicySchema, req.body);
  if (!Object.keys(input).length) throw new ConflictError('CONFLICT', 'No changes supplied');
  const policy = await prisma.accommodationPolicy.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.priority !== undefined ? { priority: input.priority } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      ...(input.approvalMode !== undefined ? { approvalMode: input.approvalMode } : {}),
      ...(input.criteria !== undefined
        ? { criteria: input.criteria as Prisma.InputJsonValue }
        : {}),
      ...(input.rules !== undefined ? { rules: input.rules as Prisma.InputJsonValue } : {}),
    },
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'POLICY_UPDATE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: policy.id,
    beforeData: { name: existing.name, isActive: existing.isActive },
    afterData: { name: policy.name, isActive: policy.isActive },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, mapPolicy(policy));
});
