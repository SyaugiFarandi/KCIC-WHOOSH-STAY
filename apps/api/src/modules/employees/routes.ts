import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  paginationQuerySchema,
  type EmployeeDetail,
  type EmployeeFilterOptions,
  type EmployeeSummary,
  type EmployeesSummary,
  type PaginationMeta,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { NotFoundError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { employeeSyncMode } from './service.js';

export const employeesRouter = Router();

const idSchema = z.uuid();

function optionalFilter(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function toSummary(employee: {
  id: string;
  employeeCode: string;
  fullName: string;
  workEmail: string | null;
  departmentCode: string | null;
  departmentName: string | null;
  divisionCode: string | null;
  divisionName: string | null;
  positionCode: string | null;
  positionName: string | null;
  homeStationCode: string | null;
  joinDate: Date | null;
  employmentStatus: string;
  eligibilityStatus: string;
  sourceSystem: string;
  syncedAt: Date | null;
}): EmployeeSummary {
  return {
    id: employee.id,
    employeeCode: employee.employeeCode,
    fullName: employee.fullName,
    workEmail: employee.workEmail,
    departmentCode: employee.departmentCode,
    departmentName: employee.departmentName,
    divisionCode: employee.divisionCode,
    divisionName: employee.divisionName,
    positionCode: employee.positionCode,
    positionName: employee.positionName,
    homeStationCode: employee.homeStationCode,
    joinDate: employee.joinDate ? employee.joinDate.toISOString().slice(0, 10) : null,
    employmentStatus: employee.employmentStatus,
    eligibilityStatus: employee.eligibilityStatus,
    sourceSystem: employee.sourceSystem,
    syncedAt: employee.syncedAt?.toISOString() ?? null,
  };
}

employeesRouter.get('/employees', requirePermission('employees.read'), async (req, res) => {
  const query = validate(paginationQuerySchema, req.query);

  const employmentStatus = optionalFilter(req.query.employmentStatus);
  const departmentCode = optionalFilter(req.query.departmentCode);
  const divisionCode = optionalFilter(req.query.divisionCode);
  const positionCode = optionalFilter(req.query.positionCode);
  const homeStationCode = optionalFilter(req.query.homeStationCode);
  const sourceSystem = optionalFilter(req.query.sourceSystem);

  const where: Prisma.EmployeeWhereInput = {
    ...(employmentStatus ? { employmentStatus } : {}),
    ...(departmentCode ? { departmentCode } : {}),
    ...(divisionCode ? { divisionCode } : {}),
    ...(positionCode ? { positionCode } : {}),
    ...(homeStationCode ? { homeStationCode } : {}),
    ...(sourceSystem ? { sourceSystem } : {}),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: 'insensitive' } },
            { employeeCode: { contains: query.q, mode: 'insensitive' } },
            { departmentName: { contains: query.q, mode: 'insensitive' } },
            { divisionName: { contains: query.q, mode: 'insensitive' } },
            { positionName: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, employees] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const items: EmployeeSummary[] = employees.map(toSummary);
  const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
  sendSuccess(res, { items, pagination }, { pagination });
});

employeesRouter.get('/employees/summary', requirePermission('employees.read'), async (_req, res) => {
  const [total, statusRows, locationRows, sourceRows, departmentRows, positionRows, syncAggregate] =
    await Promise.all([
      prisma.employee.count(),
      prisma.employee.groupBy({ by: ['employmentStatus'], _count: { _all: true } }),
      prisma.employee.groupBy({ by: ['homeStationCode'], _count: { _all: true } }),
      prisma.employee.groupBy({ by: ['sourceSystem'], _count: { _all: true } }),
      prisma.employee.groupBy({ by: ['departmentCode'] }),
      prisma.employee.groupBy({ by: ['positionCode'] }),
      prisma.employee.aggregate({ _max: { syncedAt: true } }),
    ]);
  const summary: EmployeesSummary = {
    total,
    byStatus: Object.fromEntries(
      statusRows.map((row) => [row.employmentStatus, row._count._all]),
    ),
    byLocation: Object.fromEntries(
      locationRows
        .filter((row) => row.homeStationCode !== null)
        .map((row) => [row.homeStationCode as string, row._count._all]),
    ),
    bySource: Object.fromEntries(
      sourceRows.map((row) => [row.sourceSystem, row._count._all]),
    ),
    departments: departmentRows.filter((row) => row.departmentCode !== null).length,
    positions: positionRows.filter((row) => row.positionCode !== null).length,
    lastSyncedAt: syncAggregate._max.syncedAt?.toISOString() ?? null,
    generatedAt: new Date().toISOString(),
  };
  sendSuccess(res, summary);
});

employeesRouter.get(
  '/employees/filter-options',
  requirePermission('employees.read'),
  async (_req, res) => {
    const [locations, references, sourceRows] = await Promise.all([
      prisma.location.findMany({
        where: { status: 'ACTIVE' },
        orderBy: { code: 'asc' },
        select: { code: true, name: true },
      }),
      prisma.orgReference.findMany({
        orderBy: [{ type: 'asc' }, { name: 'asc' }],
        select: { type: true, code: true, name: true, status: true },
      }),
      prisma.employee.groupBy({ by: ['sourceSystem'], orderBy: { sourceSystem: 'asc' } }),
    ]);

    const byType = (type: string) =>
      references
        .filter((row) => row.type === type)
        .map((row) => ({ code: row.code, name: row.name, status: row.status }));

    const options: EmployeeFilterOptions = {
      locations,
      departments: byType('DEPARTMENT'),
      divisions: byType('DIVISION'),
      positions: byType('POSITION'),
      sources: sourceRows.map((row) => row.sourceSystem),
    };
    sendSuccess(res, options);
  },
);

employeesRouter.get('/employees/:id', requirePermission('employees.read'), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const employee = await prisma.employee.findUnique({
    where: { id },
    include: {
      supervisor: { select: { id: true, employeeCode: true, fullName: true } },
      _count: { select: { subordinates: true } },
    },
  });
  if (!employee) throw new NotFoundError('Karyawan tidak ditemukan.');

  const detail: EmployeeDetail = {
    ...toSummary(employee),
    supervisor: employee.supervisor,
    subordinateCount: employee._count.subordinates,
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  };
  sendSuccess(res, detail);
});

employeesRouter.get(
  '/admin/employees/sync-runs',
  requirePermission('employees.read'),
  async (req, res) => {
    if (!req.access?.global) {
      sendSuccess(res, { items: [], integrationStatus: 'DISABLED' });
      return;
    }

    const query = validate(paginationQuerySchema, req.query);
    const [total, runs] = await Promise.all([
      prisma.employeeSyncLog.count(),
      prisma.employeeSyncLog.findMany({
        orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const items = runs.map((run) => ({
      id: run.id,
      sourceSystem: run.sourceSystem,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      status: run.status,
      fetchedCount: run.fetchedCount,
      insertedCount: run.insertedCount,
      updatedCount: run.updatedCount,
      failedCount: run.failedCount,
      errorSummary: run.errorSummary,
    }));

    const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(
      res,
      {
        items,
        pagination,
        integrationStatus: employeeSyncMode(),
      },
      { pagination },
    );
  },
);