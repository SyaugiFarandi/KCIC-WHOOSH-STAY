import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  POLICY_CATEGORY_LABELS,
  POLICY_WORKFLOW_LABELS,
  validatePolicyParameters,
  type PolicyCategory,
  type PolicyCounts,
  type PolicyCreateInput,
  type PolicyDashboardSummary,
  type PolicyDecision,
  type PolicyDetail,
  type PolicyEffect,
  type PolicyEvaluationLine,
  type PolicyEvaluationListQuery,
  type PolicyEvaluationLogEntry,
  type PolicyEvaluationResult,
  type PolicyEvaluationLogResult,
  type PolicyListQuery,
  type PolicySeverity,
  type PolicySimulationInput,
  type PolicyStatus,
  type PolicySummary,
  type PolicyUpdateInput,
  type PolicyVersionEntry,
  type PolicyWorkflow,
} from '@whoosh/shared';
import { formatDateOnly, nightsBetween, parseDateOnly, todayInJakarta } from '../../lib/dates.js';
import { logger } from '../../lib/logger.js';
import { prisma } from '../../lib/prisma.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errors.js';
import { writeAudit } from '../audit/audit.js';
import type { AccessScope } from '../auth/types.js';
import {
  aggregatePolicyDecision,
  buildPolicyViolationKey,
  type EvaluationPolicy,
  type PolicyEvaluationContext,
} from './engine.js';
import { safeRecordReservationException } from '../exceptions/service.js';

type PolicyRow = Prisma.AccommodationPolicyGetPayload<Record<string, never>>;
type VersionRow = Prisma.AccommodationPolicyVersionGetPayload<Record<string, never>>;

interface ActorMeta {
  userId: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

function asRecord(value: Prisma.JsonValue | null): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function dormitoryLookup(ids: Array<string | null>): Promise<Map<string, { code: string; name: string }>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (!unique.length) return new Map();
  const rows = await prisma.dormitory.findMany({
    where: { id: { in: unique } },
    select: { id: true, code: true, name: true },
  });
  return new Map(rows.map((row) => [row.id, { code: row.code, name: row.name }]));
}

async function visibleDormitoryIds(access: AccessScope): Promise<string[] | null> {
  if (access.global) return null;
  if (access.selfOnly) {
    throw new ForbiddenError('Policy Engine is only available to accommodation staff');
  }
  const ids = new Set(access.dormitoryIds);
  if (access.buildingIds.length) {
    const buildings = await prisma.building.findMany({
      where: { id: { in: access.buildingIds } },
      select: { dormitoryId: true },
    });
    for (const building of buildings) ids.add(building.dormitoryId);
  }
  if (!ids.size) throw new ForbiddenError('No accommodation scope is available');
  return [...ids];
}

function assertGlobal(access: AccessScope): void {
  if (!access.global) {
    throw new ForbiddenError('Policy Engine changes require a global scope');
  }
}

function toSummary(
  row: PolicyRow,
  dormitories: Map<string, { code: string; name: string }>,
): PolicySummary {
  const dormitory = row.dormitoryId ? dormitories.get(row.dormitoryId) : undefined;
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description,
    category: row.category as PolicyCategory,
    effect: row.effect as PolicyEffect,
    severity: (row.severity ?? 'MEDIUM') as PolicySeverity,
    priority: row.priority,
    status: row.status as PolicyStatus,
    version: row.version,
    approved: row.approvedAt !== null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    dormitoryId: row.dormitoryId,
    dormitoryCode: dormitory?.code ?? null,
    dormitoryName: dormitory?.name ?? null,
    effectiveFrom: formatDateOnly(row.effectiveFrom ?? row.createdAt),
    effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    createdByUserId: row.createdByUserId,
    updatedByUserId: row.updatedByUserId,
  };
}

function toDetail(row: PolicyRow, dormitories: Map<string, { code: string; name: string }>): PolicyDetail {
  return {
    ...toSummary(row, dormitories),
    parameters: asRecord(row.parameters),
    conditions: asRecord(row.conditions),
  };
}

function toVersionEntry(row: VersionRow): PolicyVersionEntry {
  return {
    id: row.id,
    version: row.version,
    code: row.code,
    name: row.name,
    category: row.category as PolicyCategory,
    effect: row.effect as PolicyEffect,
    severity: row.severity as PolicySeverity,
    priority: row.priority,
    parameters: asRecord(row.parameters),
    conditions: asRecord(row.conditions),
    dormitoryId: row.dormitoryId,
    effectiveFrom: formatDateOnly(row.effectiveFrom),
    effectiveTo: row.effectiveTo ? formatDateOnly(row.effectiveTo) : null,
    status: row.status as PolicyStatus,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedByUserId: row.approvedByUserId,
    createdByUserId: row.createdByUserId,
    changeNote: row.changeNote,
    createdAt: row.createdAt.toISOString(),
  };
}

function toEvaluationPolicy(row: PolicyRow): EvaluationPolicy {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    category: row.category as PolicyCategory,
    effect: row.effect as PolicyEffect,
    severity: (row.severity ?? 'MEDIUM') as PolicySeverity,
    priority: row.priority,
    version: row.version,
    parameters: asRecord(row.parameters),
    conditions: asRecord(row.conditions),
    dormitoryId: row.dormitoryId,
    effectiveFrom: row.effectiveFrom ?? row.createdAt,
    effectiveTo: row.effectiveTo,
  };
}

async function loadEnginePolicy(id: string, access: AccessScope): Promise<PolicyRow> {
  const row = await prisma.accommodationPolicy.findFirst({
    where: { id, engineManaged: true },
  });
  if (!row) throw new NotFoundError('Policy not found');
  const dormitoryIds = await visibleDormitoryIds(access);
  if (dormitoryIds && row.dormitoryId && !dormitoryIds.includes(row.dormitoryId)) {
    throw new NotFoundError('Policy not found');
  }
  return row;
}

function policyScopeWhere(dormitoryIds: string[] | null): Prisma.AccommodationPolicyWhereInput {
  if (!dormitoryIds) return {};
  return { OR: [{ dormitoryId: null }, { dormitoryId: { in: dormitoryIds } }] };
}

export interface PolicyListPayload {
  items: PolicySummary[];
  counts: PolicyCounts;
  total: number;
}

export async function listEnginePolicies(
  access: AccessScope,
  query: PolicyListQuery,
): Promise<PolicyListPayload> {
  const dormitoryIds = await visibleDormitoryIds(access);
  const filters: Prisma.AccommodationPolicyWhereInput[] = [
    { engineManaged: true },
    policyScopeWhere(dormitoryIds),
  ];
  if (query.category) filters.push({ category: query.category });
  if (query.effect) filters.push({ effect: query.effect });
  if (query.dormitoryId) filters.push({ dormitoryId: query.dormitoryId });
  if (query.q) {
    filters.push({
      OR: [
        { name: { contains: query.q, mode: 'insensitive' } },
        { code: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const baseWhere: Prisma.AccommodationPolicyWhereInput = { AND: filters };
  const listWhere: Prisma.AccommodationPolicyWhereInput = {
    AND: [...filters, ...(query.status ? [{ status: query.status }] : [])],
  };

  const [rows, total, grouped] = await Promise.all([
    prisma.accommodationPolicy.findMany({
      where: listWhere,
      orderBy: [{ priority: 'desc' }, { code: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.accommodationPolicy.count({ where: listWhere }),
    prisma.accommodationPolicy.groupBy({
      by: ['status'],
      where: baseWhere,
      _count: { _all: true },
    }),
  ]);

  const counts: PolicyCounts = { active: 0, draft: 0, inactive: 0 };
  for (const group of grouped) {
    const amount = group._count._all;
    if (group.status === 'ACTIVE') counts.active += amount;
    if (group.status === 'DRAFT') counts.draft += amount;
    if (group.status === 'INACTIVE') counts.inactive += amount;
  }

  const dormitories = await dormitoryLookup(rows.map((row) => row.dormitoryId));
  return { items: rows.map((row) => toSummary(row, dormitories)), counts, total };
}

export async function getEnginePolicy(id: string, access: AccessScope): Promise<PolicyDetail> {
  const row = await loadEnginePolicy(id, access);
  const dormitories = await dormitoryLookup([row.dormitoryId]);
  return toDetail(row, dormitories);
}

export async function listPolicyVersions(
  id: string,
  access: AccessScope,
): Promise<PolicyVersionEntry[]> {
  await loadEnginePolicy(id, access);
  const rows = await prisma.accommodationPolicyVersion.findMany({
    where: { policyId: id },
    orderBy: { version: 'desc' },
  });
  return rows.map(toVersionEntry);
}

async function snapshotVersion(
  tx: Prisma.TransactionClient,
  policy: PolicyRow,
  input: { version: number; status: PolicyStatus; actorUserId: string; changeNote?: string | null },
): Promise<void> {
  await tx.accommodationPolicyVersion.create({
    data: {
      policyId: policy.id,
      version: input.version,
      code: policy.code,
      name: policy.name,
      category: policy.category!,
      effect: policy.effect!,
      severity: policy.severity ?? 'MEDIUM',
      priority: policy.priority,
      parameters: policy.parameters as Prisma.InputJsonValue,
      conditions: policy.conditions as Prisma.InputJsonValue,
      dormitoryId: policy.dormitoryId,
      effectiveFrom: policy.effectiveFrom ?? policy.createdAt,
      effectiveTo: policy.effectiveTo,
      approvalMode: policy.approvalMode,
      status: input.status,
      approvedAt: policy.approvedAt,
      approvedByUserId: policy.approvedByUserId,
      createdByUserId: input.actorUserId,
      changeNote: input.changeNote ?? null,
    },
  });
}

export async function createEnginePolicy(
  input: PolicyCreateInput,
  actor: ActorMeta,
  access: AccessScope,
): Promise<PolicyDetail> {
  assertGlobal(access);
  const existing = await prisma.accommodationPolicy.findUnique({ where: { code: input.code } });
  if (existing) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Kode kebijakan sudah digunakan.');
  }
  const parameterIssues = validatePolicyParameters(input.category, input.parameters);
  if (parameterIssues.length) {
    throw new ConflictError(ERROR_CODES.VALIDATION_ERROR, parameterIssues.join(' '));
  }

  const policy = await prisma.$transaction(async (tx) => {
    const created = await tx.accommodationPolicy.create({
      data: {
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        priority: input.priority,
        isActive: false,
        approvalMode: input.effect,
        criteria: input.conditions as Prisma.InputJsonValue,
        rules: input.parameters as Prisma.InputJsonValue,
        effectiveFrom: parseDateOnly(input.effectiveFrom),
        effectiveTo: input.effectiveTo ? parseDateOnly(input.effectiveTo) : null,
        engineManaged: true,
        category: input.category,
        effect: input.effect,
        severity: input.severity,
        status: 'DRAFT',
        parameters: input.parameters as Prisma.InputJsonValue,
        conditions: input.conditions as Prisma.InputJsonValue,
        version: 1,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId,
        dormitoryId: input.dormitoryId ?? null,
      },
    });
    await snapshotVersion(tx, created, {
      version: 1,
      status: 'DRAFT',
      actorUserId: actor.userId,
      changeNote: input.changeNote ?? 'Versi awal',
    });
    return created;
  });

  await writeAudit({
    actorUserId: actor.userId,
    action: 'POLICY_ENGINE_CREATE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: policy.id,
    afterData: {
      code: policy.code,
      category: policy.category,
      effect: policy.effect,
      status: policy.status,
      version: policy.version,
    },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  const dormitories = await dormitoryLookup([policy.dormitoryId]);
  return toDetail(policy, dormitories);
}

export async function updateEnginePolicy(
  id: string,
  input: PolicyUpdateInput,
  actor: ActorMeta,
  access: AccessScope,
): Promise<PolicyDetail> {
  assertGlobal(access);
  const existing = await loadEnginePolicy(id, access);
  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError(
      ERROR_CODES.POLICY_VERSION_CONFLICT,
      'Kebijakan telah berubah. Muat ulang versi terbaru sebelum menyimpan.',
    );
  }
  const contentKeys = [
    'name',
    'description',
    'category',
    'effect',
    'severity',
    'priority',
    'dormitoryId',
    'effectiveFrom',
    'effectiveTo',
    'parameters',
    'conditions',
  ].filter((key) => key in input);
  if (!contentKeys.length) {
    throw new ConflictError(ERROR_CODES.CONFLICT, 'Tidak ada perubahan yang dikirim.');
  }

  const mergedCategory = (input.category ?? existing.category) as PolicyCategory;
  const mergedParameters = input.parameters ?? asRecord(existing.parameters);
  const mergedConditions = input.conditions ?? asRecord(existing.conditions);
  const parameterIssues = validatePolicyParameters(mergedCategory, mergedParameters);
  if (parameterIssues.length) {
    throw new ConflictError(ERROR_CODES.VALIDATION_ERROR, parameterIssues.join(' '));
  }
  const mergedFrom = input.effectiveFrom ?? formatDateOnly(existing.effectiveFrom ?? existing.createdAt);
  const mergedTo =
    input.effectiveTo !== undefined
      ? input.effectiveTo
      : existing.effectiveTo
        ? formatDateOnly(existing.effectiveTo)
        : null;
  if (mergedTo && mergedTo < mergedFrom) {
    throw new ConflictError(
      ERROR_CODES.VALIDATION_ERROR,
      'Tanggal berlaku akhir tidak boleh sebelum tanggal mulai.',
    );
  }

  const nextVersion = existing.version + 1;
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.accommodationPolicy.updateMany({
      where: { id, engineManaged: true, version: existing.version },
      data: {
        name: input.name ?? existing.name,
        description: input.description !== undefined ? input.description : existing.description,
        category: input.category ?? existing.category,
        effect: input.effect ?? existing.effect,
        severity: input.severity ?? existing.severity,
        priority: input.priority ?? existing.priority,
        dormitoryId: input.dormitoryId !== undefined ? input.dormitoryId : existing.dormitoryId,
        effectiveFrom: parseDateOnly(mergedFrom),
        effectiveTo: mergedTo ? parseDateOnly(mergedTo) : null,
        parameters: mergedParameters as Prisma.InputJsonValue,
        conditions: mergedConditions as Prisma.InputJsonValue,
        criteria: mergedConditions as Prisma.InputJsonValue,
        rules: mergedParameters as Prisma.InputJsonValue,
        version: nextVersion,
        status: 'DRAFT',
        isActive: false,
        approvalMode: (input.effect ?? existing.effect) as string,
        approvedAt: null,
        approvedByUserId: null,
        updatedByUserId: actor.userId,
      },
    });
    if (result.count === 0) {
      throw new ConflictError(
        ERROR_CODES.POLICY_VERSION_CONFLICT,
        'Kebijakan telah berubah. Muat ulang versi terbaru sebelum menyimpan.',
      );
    }
    const row = await tx.accommodationPolicy.findUniqueOrThrow({ where: { id } });
    await snapshotVersion(tx, row, {
      version: nextVersion,
      status: 'DRAFT',
      actorUserId: actor.userId,
      changeNote: input.changeNote ?? `Perubahan versi ${nextVersion}`,
    });
    return row;
  });

  await writeAudit({
    actorUserId: actor.userId,
    action: 'POLICY_ENGINE_UPDATE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: id,
    beforeData: { version: existing.version, status: existing.status },
    afterData: { version: updated.version, status: updated.status, name: updated.name },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });

  const dormitories = await dormitoryLookup([updated.dormitoryId]);
  return toDetail(updated, dormitories);
}

export async function approveEnginePolicy(
  id: string,
  input: { note: string },
  actor: ActorMeta,
  access: AccessScope,
): Promise<PolicyDetail> {
  assertGlobal(access);
  const existing = await loadEnginePolicy(id, access);
  if (existing.status === 'ACTIVE') {
    throw new ConflictError(ERROR_CODES.POLICY_STATE_INVALID, 'Kebijakan aktif sudah disetujui.');
  }
  const issues = validatePolicyParameters(
    existing.category as PolicyCategory,
    asRecord(existing.parameters),
  );
  if (issues.length) {
    throw new ConflictError(ERROR_CODES.POLICY_STATE_INVALID, issues.join(' '));
  }
  const approved = await prisma.accommodationPolicy.update({
    where: { id },
    data: {
      approvedAt: new Date(),
      approvedByUserId: actor.userId,
      updatedByUserId: actor.userId,
    },
  });
  await prisma.accommodationPolicyVersion.updateMany({
    where: { policyId: id, version: approved.version },
    data: { approvedAt: approved.approvedAt, approvedByUserId: actor.userId },
  });
  await writeAudit({
    actorUserId: actor.userId,
    action: 'POLICY_ENGINE_APPROVE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: id,
    afterData: { version: approved.version, note: input.note },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  const dormitories = await dormitoryLookup([approved.dormitoryId]);
  return toDetail(approved, dormitories);
}

export async function activateEnginePolicy(
  id: string,
  input: { expectedVersion?: number; note?: string },
  actor: ActorMeta,
  access: AccessScope,
): Promise<PolicyDetail> {
  assertGlobal(access);
  const existing = await loadEnginePolicy(id, access);
  if (existing.status === 'ACTIVE') {
    throw new ConflictError(ERROR_CODES.POLICY_STATE_INVALID, 'Kebijakan sudah aktif.');
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError(
      ERROR_CODES.POLICY_VERSION_CONFLICT,
      'Kebijakan telah berubah. Muat ulang versi terbaru.',
    );
  }
  if (!existing.approvedAt) {
    throw new ConflictError(
      ERROR_CODES.POLICY_NOT_APPROVED,
      'Parameter versi ini belum disetujui. Tinjau lalu setujui sebelum mengaktifkan.',
    );
  }
  if (existing.effectiveTo && formatDateOnly(existing.effectiveTo) < todayInJakarta()) {
    throw new ConflictError(
      ERROR_CODES.POLICY_STATE_INVALID,
      'Masa berlaku kebijakan sudah berakhir.',
    );
  }
  const activated = await prisma.$transaction(async (tx) => {
    const result = await tx.accommodationPolicy.updateMany({
      where: { id, version: existing.version, engineManaged: true },
      data: { status: 'ACTIVE', isActive: true, updatedByUserId: actor.userId },
    });
    if (result.count === 0) {
      throw new ConflictError(
        ERROR_CODES.POLICY_VERSION_CONFLICT,
        'Kebijakan telah berubah. Muat ulang versi terbaru.',
      );
    }
    await tx.accommodationPolicyVersion.updateMany({
      where: { policyId: id, version: existing.version },
      data: { status: 'ACTIVE' },
    });
    return tx.accommodationPolicy.findUniqueOrThrow({ where: { id } });
  });
  await writeAudit({
    actorUserId: actor.userId,
    action: 'POLICY_ENGINE_ACTIVATE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: id,
    beforeData: { status: existing.status },
    afterData: { status: activated.status, version: activated.version, note: input.note },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  const dormitories = await dormitoryLookup([activated.dormitoryId]);
  return toDetail(activated, dormitories);
}

export async function deactivateEnginePolicy(
  id: string,
  input: { expectedVersion?: number; note?: string },
  actor: ActorMeta,
  access: AccessScope,
): Promise<PolicyDetail> {
  assertGlobal(access);
  const existing = await loadEnginePolicy(id, access);
  if (existing.status !== 'ACTIVE') {
    throw new ConflictError(ERROR_CODES.POLICY_STATE_INVALID, 'Kebijakan tidak sedang aktif.');
  }
  if (input.expectedVersion !== undefined && input.expectedVersion !== existing.version) {
    throw new ConflictError(
      ERROR_CODES.POLICY_VERSION_CONFLICT,
      'Kebijakan telah berubah. Muat ulang versi terbaru.',
    );
  }
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.accommodationPolicy.updateMany({
      where: { id, version: existing.version, engineManaged: true, status: 'ACTIVE' },
      data: { status: 'INACTIVE', isActive: false, updatedByUserId: actor.userId },
    });
    if (result.count === 0) {
      throw new ConflictError(
        ERROR_CODES.POLICY_VERSION_CONFLICT,
        'Kebijakan telah berubah. Muat ulang versi terbaru.',
      );
    }
    await tx.accommodationPolicyVersion.updateMany({
      where: { policyId: id, version: existing.version },
      data: { status: 'INACTIVE' },
    });
    return tx.accommodationPolicy.findUniqueOrThrow({ where: { id } });
  });
  await writeAudit({
    actorUserId: actor.userId,
    action: 'POLICY_ENGINE_DEACTIVATE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: id,
    beforeData: { status: existing.status },
    afterData: { status: updated.status, version: updated.version, note: input.note },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
  const dormitories = await dormitoryLookup([updated.dormitoryId]);
  return toDetail(updated, dormitories);
}

export async function deleteEnginePolicy(
  id: string,
  actor: ActorMeta,
  access: AccessScope,
): Promise<void> {
  assertGlobal(access);
  const existing = await loadEnginePolicy(id, access);
  if (existing.status === 'ACTIVE') {
    throw new ConflictError(
      ERROR_CODES.POLICY_STATE_INVALID,
      'Nonaktifkan kebijakan sebelum menghapus.',
    );
  }
  await prisma.accommodationPolicy.delete({ where: { id } });
  await writeAudit({
    actorUserId: actor.userId,
    action: 'POLICY_ENGINE_DELETE',
    entityType: 'ACCOMMODATION_POLICY',
    entityId: id,
    beforeData: { code: existing.code, version: existing.version, status: existing.status },
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
  });
}

interface EvaluationOptions {
  actorUserId?: string | null;
  requestId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  simulated?: boolean;
  log?: boolean;
  /**
   * Transaction the caller already runs in. The violation record must share it,
   * otherwise the referenced reservation is not visible yet and the FK fails.
   */
  exceptionTx?: Prisma.TransactionClient;
}

async function loadActivePolicies(
  context: PolicyEvaluationContext,
  asOfDate: string,
): Promise<PolicyRow[]> {
  const asOf = parseDateOnly(asOfDate);
  return prisma.accommodationPolicy.findMany({
    where: {
      AND: [
        { engineManaged: true, status: 'ACTIVE', effectiveFrom: { lte: asOf } },
        { OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }] },
        {
          OR: [
            { dormitoryId: null },
            ...(context.dormitoryId ? [{ dormitoryId: context.dormitoryId }] : []),
          ],
        },
      ],
    },
    orderBy: [{ priority: 'desc' }, { code: 'asc' }],
  });
}

async function writeEvaluationLogs(
  result: PolicyEvaluationResult,
  rows: PolicyRow[],
  context: PolicyEvaluationContext,
  options: EvaluationOptions,
): Promise<void> {
  if (!result.evaluations.length) return;
  const byId = new Map(rows.map((row) => [row.id, row]));
  const contextJson = JSON.parse(JSON.stringify(context)) as Prisma.InputJsonValue;
  try {
    await prisma.policyEvaluation.createMany({
      data: result.evaluations.map((line) => {
        const row = byId.get(line.policyId);
        return {
          policyId: line.policyId,
          policyCode: line.policyCode,
          policyVersion: line.policyVersion,
          category: line.category,
          workflow: context.workflow,
          result: line.result,
          reason: line.reason.slice(0, 500),
          matched: line.matched,
          simulated: options.simulated ?? false,
          conditions: (row?.conditions ?? {}) as Prisma.InputJsonValue,
          context: contextJson,
          subjectType: options.subjectType ?? null,
          subjectId: options.subjectId ?? null,
          actorUserId: options.actorUserId ?? null,
          requestId: options.requestId ?? null,
          dormitoryId: context.dormitoryId ?? null,
          evaluatedAt: new Date(result.evaluatedAt),
        };
      }),
    });
  } catch (error) {
    logger.warn({ err: error }, 'failed to write policy evaluation logs');
  }
}

export async function evaluatePolicies(
  context: PolicyEvaluationContext,
  options: EvaluationOptions = {},
): Promise<PolicyEvaluationResult> {
  const rows = await loadActivePolicies(context, context.asOfDate);
  const result = aggregatePolicyDecision(rows.map(toEvaluationPolicy), context);
  if (options.log !== false) {
    await writeEvaluationLogs(result, rows, context, options);
  }
  return result;
}

async function recordPolicyViolation(
  result: PolicyEvaluationResult,
  context: PolicyEvaluationContext,
  options: EvaluationOptions,
): Promise<void> {
  if (!context.dormitoryId || !result.blockingPolicy) return;
  const blocking = result.blockingPolicy;
  const forced = result.evaluations.filter((line) => line.matched);
  await safeRecordReservationException({
    dedupeKey: buildPolicyViolationKey({
      policyCode: blocking.policyCode,
      workflow: context.workflow,
      dormitoryId: context.dormitoryId,
      subjectId: options.subjectId ?? null,
      checkInDate: context.checkInDate ?? null,
      checkOutDate: context.checkOutDate ?? null,
    }),
    type: 'POLICY_VIOLATION',
    severity: blocking.severity,
    dormitoryId: context.dormitoryId,
    reservationId:
      options.subjectType === 'RESERVATION' || options.subjectType === 'STAY'
        ? (options.subjectId ?? null)
        : null,
    title: `Kebijakan ${blocking.policyCode} memblokir ${POLICY_WORKFLOW_LABELS[context.workflow]}`,
    description: `Versi ${blocking.policyVersion} (${POLICY_CATEGORY_LABELS[blocking.category]}): ${blocking.reason}`,
    evidence: {
      decision: result.decision,
      policyId: blocking.policyId,
      policyCode: blocking.policyCode,
      policyVersion: blocking.policyVersion,
      category: blocking.category,
      effect: blocking.effect,
      workflow: context.workflow,
      reason: blocking.reason,
      triggered: forced.map((line) => ({
        policyCode: line.policyCode,
        version: line.policyVersion,
        result: line.result,
        reason: line.reason,
      })),
      context: JSON.parse(JSON.stringify(context)) as Prisma.InputJsonValue,
    },
    actorUserId: options.actorUserId ?? null,
  }, options.exceptionTx);
}

export interface EnforceOptions extends EvaluationOptions {
  allowApproval?: boolean;
}

export async function enforcePolicyDecision(
  result: PolicyEvaluationResult,
  context: PolicyEvaluationContext,
  options: EnforceOptions = {},
): Promise<PolicyEvaluationResult> {
  if (result.decision === 'ALLOWED' || !result.blockingPolicy) return result;
  await recordPolicyViolation(result, context, options);
  if (
    options.allowApproval &&
    (result.decision === 'REQUIRES_APPROVAL' || result.decision === 'REQUIRES_MANUAL_REVIEW')
  ) {
    return result;
  }
  const code =
    result.decision === 'DENIED'
      ? ERROR_CODES.POLICY_DENIED
      : ERROR_CODES.POLICY_APPROVAL_REQUIRED;
  const blocking = result.blockingPolicy;
  const verdict =
    result.decision === 'DENIED'
      ? 'menolak'
      : result.decision === 'REQUIRES_APPROVAL'
        ? 'memerlukan persetujuan'
        : 'memerlukan tinjauan manual';
  throw new ConflictError(
    code,
    `Kebijakan ${blocking.policyCode} v${blocking.policyVersion} ${verdict} ${POLICY_WORKFLOW_LABELS[context.workflow]}: ${blocking.reason}`,
  );
}

export async function evaluateAndEnforce(
  context: PolicyEvaluationContext,
  options: EnforceOptions = {},
): Promise<PolicyEvaluationResult> {
  const result = await evaluatePolicies(context, options);
  return enforcePolicyDecision(result, context, options);
}

function buildSimulationContext(input: PolicySimulationInput, asOfDate: string): PolicyEvaluationContext {
  const sameDayCancellation =
    input.sameDayCancellation ??
    (input.workflow === 'CANCELLATION' && input.checkInDate === asOfDate);
  return {
    workflow: input.workflow,
    asOfDate,
    dormitoryId: input.dormitoryId ?? null,
    checkInDate: input.checkInDate ?? null,
    checkOutDate: input.checkOutDate ?? null,
    nights:
      input.checkInDate && input.checkOutDate
        ? nightsBetween(input.checkInDate, input.checkOutDate)
        : null,
    occupantCount: input.occupantCount ?? null,
    purpose: input.purpose ?? null,
    isEmergency: input.isEmergency ?? false,
    emergencyReason: input.emergencyReason ?? null,
    priority: input.priority ?? null,
    hasRosterShift: input.hasRosterShift,
    availableBeds: input.availableBeds,
    requestedBeds: input.requestedBeds,
    hasExplicitBeds: input.requestedBeds !== undefined ? input.requestedBeds > 0 : undefined,
    employeeCategories: input.employeeCategories,
    employmentStatus: input.employmentStatus ?? null,
    eligibilityStatus: input.eligibilityStatus ?? null,
    earlyCheckInMinutes: input.earlyCheckInMinutes,
    lateCheckOutMinutes: input.lateCheckOutMinutes,
    beforeScheduledDate:
      input.checkInDate !== undefined ? asOfDate > input.checkInDate : undefined,
    beforeScheduledCheckout:
      input.checkOutDate !== undefined ? asOfDate < input.checkOutDate : undefined,
    cancellationNoticeHours: input.cancellationNoticeHours,
    sameDayCancellation,
    subjectType: 'SIMULATION',
    subjectId: null,
  };
}

export async function simulatePolicies(
  input: PolicySimulationInput,
  actor: ActorMeta,
  access: AccessScope,
  requestId: string,
): Promise<PolicyEvaluationResult> {
  const asOfDate = input.asOf ? formatDateOnly(new Date(input.asOf)) : todayInJakarta();
  const context = buildSimulationContext(input, asOfDate);
  const options: EvaluationOptions = {
    actorUserId: actor.userId,
    requestId,
    simulated: true,
    log: true,
    subjectType: 'SIMULATION',
    subjectId: null,
  };

  if (input.policyId) {
    const row = await loadEnginePolicy(input.policyId, access);
    const result = aggregatePolicyDecision([toEvaluationPolicy(row)], context, {
      ignoreEffectiveDate: true,
    });
    await writeEvaluationLogs(result, [row], context, options);
    return result;
  }

  const rows = await loadActivePolicies(context, asOfDate);
  const result = aggregatePolicyDecision(rows.map(toEvaluationPolicy), context);
  await writeEvaluationLogs(result, rows, context, options);
  return result;
}

function evaluationScopeWhere(
  dormitoryIds: string[] | null,
): Prisma.PolicyEvaluationWhereInput {
  if (!dormitoryIds) return {};
  return { OR: [{ dormitoryId: null }, { dormitoryId: { in: dormitoryIds } }] };
}

export async function listPolicyEvaluations(
  access: AccessScope,
  query: PolicyEvaluationListQuery,
): Promise<PolicyEvaluationLogResult> {
  const dormitoryIds = await visibleDormitoryIds(access);
  const filters: Prisma.PolicyEvaluationWhereInput[] = [evaluationScopeWhere(dormitoryIds)];
  if (query.policyId) filters.push({ policyId: query.policyId });
  if (query.workflow) filters.push({ workflow: query.workflow });
  if (query.result) filters.push({ result: query.result });
  if (query.simulated) filters.push({ simulated: query.simulated === 'true' });
  if (query.dormitoryId) filters.push({ dormitoryId: query.dormitoryId });
  if (query.q) {
    filters.push({
      OR: [
        { policyCode: { contains: query.q, mode: 'insensitive' } },
        { reason: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where: Prisma.PolicyEvaluationWhereInput = { AND: filters };

  const [rows, total] = await Promise.all([
    prisma.policyEvaluation.findMany({
      where,
      orderBy: [{ evaluatedAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.policyEvaluation.count({ where }),
  ]);

  const [dormitories, actors] = await Promise.all([
    dormitoryLookup(rows.map((row) => row.dormitoryId)),
    prisma.user.findMany({
      where: { id: { in: [...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id)))] } },
      select: { id: true, displayName: true },
    }),
  ]);
  const actorNames = new Map(actors.map((actor) => [actor.id, actor.displayName]));

  const items: PolicyEvaluationLogEntry[] = rows.map((row) => ({
    id: row.id,
    policyId: row.policyId,
    policyCode: row.policyCode,
    policyVersion: row.policyVersion,
    category: row.category as PolicyCategory,
    workflow: row.workflow as PolicyWorkflow,
    result: row.result as PolicyDecision,
    reason: row.reason,
    matched: row.matched,
    simulated: row.simulated,
    dormitoryId: row.dormitoryId,
    dormitoryCode: row.dormitoryId ? (dormitories.get(row.dormitoryId)?.code ?? null) : null,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    actorUserId: row.actorUserId,
    actorName: row.actorUserId ? (actorNames.get(row.actorUserId) ?? null) : null,
    evaluatedAt: row.evaluatedAt.toISOString(),
  }));

  return { items, pagination: { page: query.page, pageSize: query.pageSize, total, totalPages: query.pageSize > 0 ? Math.ceil(total / query.pageSize) : 0 } };
}

export async function getPolicyDashboard(access: AccessScope): Promise<PolicyDashboardSummary> {
  const dormitoryIds = await visibleDormitoryIds(access);
  const scope = policyScopeWhere(dormitoryIds);
  const since = new Date(Date.now() - 7 * 86_400_000);
  const evaluationScope = evaluationScopeWhere(dormitoryIds);

  const [grouped, activeCategories, evaluationsLast7Days, deniedLast7Days] = await Promise.all([
    prisma.accommodationPolicy.groupBy({
      by: ['status'],
      where: { AND: [{ engineManaged: true }, scope] },
      _count: { _all: true },
    }),
    prisma.accommodationPolicy.findMany({
      where: { AND: [{ engineManaged: true, status: 'ACTIVE' }, scope] },
      select: { category: true },
      distinct: ['category'],
    }),
    prisma.policyEvaluation.count({
      where: { AND: [evaluationScope, { evaluatedAt: { gte: since } }] },
    }),
    prisma.policyEvaluation.count({
      where: { AND: [evaluationScope, { result: 'DENIED', evaluatedAt: { gte: since } }] },
    }),
  ]);

  const counts: PolicyCounts = { active: 0, draft: 0, inactive: 0 };
  for (const group of grouped) {
    const amount = group._count._all;
    if (group.status === 'ACTIVE') counts.active += amount;
    if (group.status === 'DRAFT') counts.draft += amount;
    if (group.status === 'INACTIVE') counts.inactive += amount;
  }

  return {
    counts,
    total: counts.active + counts.draft + counts.inactive,
    categoriesCovered: activeCategories.length,
    evaluationsLast7Days,
    deniedLast7Days,
  };
}

export type { PolicyEvaluationContext, PolicyEvaluationLine };
