import { createHash } from 'node:crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  createPaginationQuerySchema,
  dateOnlySchema,
  type RosterAssignmentSummary,
  type RosterSyncRunSummary,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ForbiddenError, ValidationError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';
import { addDays, formatDateOnly, parseDateOnly, todayDateOnly } from '../../lib/dates.js';

export const rosterRouter = Router();

const MOCK_SOURCE = 'MOCK_ROSTER';
const SHIFT_START = '06:00:00+07:00';
const SHIFT_END = '14:00:00+07:00';
const MAX_RANGE_DAYS = 92;

function parseRosterDate(value: string, field: string): Date {
  const text = validate(dateOnlySchema, value);
  const parsed = parseDateOnly(text);
  if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== text) {
    throw new ValidationError([{ path: [field], message: 'Tanggal tidak valid.' }]);
  }
  return parsed;
}

const syncSchema = z.object({
  startDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  days: z.coerce.number().int().min(1).max(14).default(5),
});

interface MockRosterRow {
  externalRosterId: string;
  employeeId: string;
  dutyDate: string;
  stationCode: string | null;
  payloadHash: string;
}

function payloadHashOf(payload: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

async function buildMockRoster(startDate: Date, days: number): Promise<MockRosterRow[]> {
  const [employees, dormitories] = await Promise.all([
    prisma.employee.findMany({
      where: { employmentStatus: 'ACTIVE', employeeCode: { startsWith: 'DEMO-CREW-' } },
      orderBy: { employeeCode: 'asc' },
      take: 100,
    }),
    prisma.dormitory.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      select: { stationCode: true },
    }),
  ]);
  const stations = dormitories
    .map((dormitory) => dormitory.stationCode)
    .filter((code): code is string => Boolean(code));
  if (!stations.length) stations.push('MOCK-CREW-STATION');

  const rows: MockRosterRow[] = [];
  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const dutyDate = formatDateOnly(addDays(startDate, dayIndex));
    employees.forEach((employee, index) => {
      if ((index + dayIndex) % 2 !== 0) return;
      const stationCode = stations[(index + dayIndex) % stations.length];
      const shiftCode = (index + dayIndex) % 6 < 3 ? 'PAGI' : 'SIANG';
      rows.push({
        externalRosterId: `MOCK-ROSTER-${employee.employeeCode}-${dutyDate}`,
        employeeId: employee.id,
        dutyDate,
        stationCode,
        payloadHash: payloadHashOf({
          employeeCode: employee.employeeCode,
          dutyDate,
          stationCode,
          shiftCode,
        }),
      });
    });
  }
  return rows;
}

function mapAssignment(
  assignment: Prisma.RosterAssignmentGetPayload<{ include: { employee: true } }>,
): RosterAssignmentSummary {
  return {
    id: assignment.id,
    externalRosterId: assignment.externalRosterId,
    employeeId: assignment.employeeId,
    employeeName: assignment.employee.fullName,
    dutyDate: formatDateOnly(assignment.dutyDate),
    dutyStart: assignment.dutyStart?.toISOString() ?? null,
    dutyEnd: assignment.dutyEnd?.toISOString() ?? null,
    stationCode: assignment.stationCode,
    rosterStatus: assignment.rosterStatus,
    syncedAt: assignment.syncedAt.toISOString(),
  };
}

function mapSyncRun(run: {
  id: string;
  sourceSystem: string;
  startedAt: Date;
  completedAt: Date | null;
  status: string;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  errorSummary: string | null;
}): RosterSyncRunSummary {
  return {
    id: run.id,
    sourceSystem: run.sourceSystem,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    status: run.status,
    fetchedCount: run.fetchedCount,
    createdCount: run.createdCount,
    updatedCount: run.updatedCount,
    unchangedCount: run.unchangedCount,
    failedCount: run.failedCount,
    errorSummary: run.errorSummary,
  };
}

async function allowedStationCodes(access: {
  global: boolean;
  dormitoryIds: string[];
  buildingIds: string[];
}): Promise<string[] | null> {
  if (access.global) return null;
  if (!access.dormitoryIds.length && !access.buildingIds.length) return [];
  const dormitories = await prisma.dormitory.findMany({
    where: {
      OR: [
        ...(access.dormitoryIds.length ? [{ id: { in: access.dormitoryIds } }] : []),
        ...(access.buildingIds.length
          ? [{ buildings: { some: { id: { in: access.buildingIds } } } }]
          : []),
      ],
    },
    select: { stationCode: true },
  });
  return dormitories
    .map((dormitory) => dormitory.stationCode)
    .filter((code): code is string => Boolean(code));
}

rosterRouter.get('/roster/assignments', requirePermission('roster.read'), async (req, res) => {
  const query = validate(
    createPaginationQuerySchema({ pageSize: 100, maxPageSize: 200 }),
    req.query,
  );
  const { page, pageSize } = query;
  const from =
    typeof req.query.from === 'string' ? parseRosterDate(req.query.from, 'from') : todayDateOnly();
  const to =
    typeof req.query.to === 'string' ? parseRosterDate(req.query.to, 'to') : addDays(from, 6);
  if (to < from) {
    throw new ValidationError([{ path: ['to'], message: 'Tanggal akhir harus setelah tanggal mulai.' }]);
  }
  if (Math.round((to.getTime() - from.getTime()) / 86_400_000) > MAX_RANGE_DAYS) {
    throw new ValidationError([
      { path: ['to'], message: `Rentang tanggal maksimal ${MAX_RANGE_DAYS} hari.` },
    ]);
  }
  const stationCode = typeof req.query.stationCode === 'string' ? req.query.stationCode : undefined;
  const q = query.q ?? '';
  const stations = await allowedStationCodes(req.access!);

  const where: Prisma.RosterAssignmentWhereInput = {
    dutyDate: { gte: from, lte: to },
    ...(stationCode ? { stationCode } : {}),
    ...(stations ? { stationCode: { in: stations } } : {}),
    ...(q ? { employee: { fullName: { contains: q, mode: 'insensitive' } } } : {}),
  };
  const [total, assignments] = await Promise.all([
    prisma.rosterAssignment.count({ where }),
    prisma.rosterAssignment.findMany({
      where,
      include: { employee: true },
      orderBy: [{ dutyDate: 'asc' }, { stationCode: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const sourceSystem = assignments[0]?.sourceSystem ?? MOCK_SOURCE;
  const syntheticSource = sourceSystem.startsWith('MOCK') || sourceSystem.startsWith('SEED');
  const pagination = paginationMeta(total, page, pageSize);
  sendSuccess(
    res,
    {
      items: assignments.map(mapAssignment),
      integrationStatus: syntheticSource ? 'MOCK' : 'CONFIGURED',
      pagination,
    },
    { pagination },
  );
});

rosterRouter.get('/roster/sync-runs', requirePermission('roster.read'), async (req, res) => {
  if (!req.access!.global) {
    throw new ForbiddenError('Roster sync history is limited to global administrators');
  }
  const query = validate(
    createPaginationQuerySchema({ pageSize: 20, maxPageSize: 50 }),
    req.query,
  );
  const { page, pageSize } = query;
  const [total, runs] = await Promise.all([
    prisma.rosterSyncRun.count(),
    prisma.rosterSyncRun.findMany({
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  const pagination = paginationMeta(total, page, pageSize);
  sendSuccess(
    res,
    {
      items: runs.map(mapSyncRun),
      pagination,
      integrationStatus: 'MOCK' as const,
    },
    { pagination },
  );
});

rosterRouter.post('/roster/preview', requirePermission('roster.preview'), async (req, res) => {
  if (!req.access!.global) {
    throw new ForbiddenError('Roster preview is limited to global administrators');
  }
  const input = validate(syncSchema, req.body);
  const startDate = input.startDate ? parseDateOnly(input.startDate) : todayDateOnly();
  const rows = await buildMockRoster(startDate, input.days);
  const existing = await prisma.rosterAssignment.count({
    where: {
      sourceSystem: MOCK_SOURCE,
      externalRosterId: { in: rows.map((row) => row.externalRosterId) },
    },
  });
  sendSuccess(res, {
    provider: MOCK_SOURCE,
    integrationStatus: 'MOCK',
    startDate: formatDateOnly(startDate),
    days: input.days,
    wouldFetch: rows.length,
    alreadyPresent: existing,
    wouldCreate: rows.length - existing,
    sample: rows.slice(0, 10).map((row) => ({
      externalRosterId: row.externalRosterId,
      employeeId: row.employeeId,
      dutyDate: row.dutyDate,
      stationCode: row.stationCode,
    })),
  });
});

rosterRouter.post('/roster/sync', requirePermission('roster.sync'), async (req, res) => {
  if (!req.access!.global) {
    throw new ForbiddenError('Roster sync is limited to global administrators');
  }
  const input = validate(syncSchema, req.body);
  const startDate = input.startDate ? parseDateOnly(input.startDate) : todayDateOnly();
  const run = await prisma.rosterSyncRun.create({
    data: {
      sourceSystem: MOCK_SOURCE,
      status: 'RUNNING',
      initiatedBy: req.auth!.user.id,
    },
  });

  try {
    const rows = await buildMockRoster(startDate, input.days);
    let createdCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    for (const row of rows) {
      const existing = await prisma.rosterAssignment.findUnique({
        where: {
          sourceSystem_externalRosterId: {
            sourceSystem: MOCK_SOURCE,
            externalRosterId: row.externalRosterId,
          },
        },
      });
      const dutyStart = new Date(`${row.dutyDate}T${SHIFT_START}`);
      const dutyEnd = new Date(`${row.dutyDate}T${SHIFT_END}`);
      if (!existing) {
        await prisma.rosterAssignment.create({
          data: {
            sourceSystem: MOCK_SOURCE,
            externalRosterId: row.externalRosterId,
            employeeId: row.employeeId,
            dutyDate: parseDateOnly(row.dutyDate),
            dutyStart,
            dutyEnd,
            stationCode: row.stationCode,
            rosterStatus: 'FINAL',
            payloadHash: row.payloadHash,
            sourceUpdatedAt: new Date(),
            syncedAt: new Date(),
          },
        });
        createdCount += 1;
      } else if (existing.payloadHash !== row.payloadHash) {
        await prisma.rosterAssignment.update({
          where: { id: existing.id },
          data: {
            dutyStart,
            dutyEnd,
            stationCode: row.stationCode,
            rosterStatus: 'FINAL',
            payloadHash: row.payloadHash,
            sourceUpdatedAt: new Date(),
            syncedAt: new Date(),
          },
        });
        updatedCount += 1;
      } else {
        unchangedCount += 1;
      }
    }

    const completed = await prisma.rosterSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'SUCCEEDED',
        completedAt: new Date(),
        fetchedCount: rows.length,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      },
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ROSTER_SYNC',
      entityType: 'ROSTER_SYNC_RUN',
      entityId: completed.id,
      afterData: {
        provider: MOCK_SOURCE,
        fetched: rows.length,
        created: createdCount,
        updated: updatedCount,
        unchanged: unchangedCount,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, {
      ...mapSyncRun(completed),
      provider: MOCK_SOURCE,
      integrationStatus: 'MOCK',
    });
  } catch (error) {
    await prisma.rosterSyncRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        failedCount: 1,
        errorSummary: error instanceof Error ? error.message.slice(0, 500) : 'Unknown sync failure',
      },
    });
    throw error;
  }
});

rosterRouter.get('/roster/employees', requirePermission('roster.read'), async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const stations = await allowedStationCodes(req.access!);
  if (stations && stations.length === 0) {
    sendSuccess(res, { items: [] });
    return;
  }
  const employees = await prisma.employee.findMany({
    where: {
      employmentStatus: 'ACTIVE',
      ...(stations ? { homeStationCode: { in: stations } } : {}),
      ...(q ? { fullName: { contains: q, mode: 'insensitive' } } : {}),
    },
    orderBy: { employeeCode: 'asc' },
    take: 200,
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      departmentCode: true,
      departmentName: true,
      homeStationCode: true,
    },
  });
  sendSuccess(res, { items: employees });
});
