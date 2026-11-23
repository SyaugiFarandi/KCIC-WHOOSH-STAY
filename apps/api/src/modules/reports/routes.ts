import { Router } from 'express';
import { Prisma } from '@prisma/client';
import writeXlsxFile from 'write-excel-file/node';
import {
  createPaginationQuerySchema,
  dateOnlySchema,
  reportQuerySchema,
  type OccupancyReportRow,
  type OperationalReportRow,
  type ReportReservationRow,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { requirePermission } from '../auth/middleware.js';
import type { AccessScope } from '../auth/types.js';
import { readableDormitoryWhere, readableReservationWhere, readableRoomWhere } from '../../lib/scope.js';
import { addDays, formatDateOnly, todayDateOnly } from '../../lib/dates.js';
import { writeAudit } from '../audit/audit.js';
import { ForbiddenError, ValidationError } from '../../middleware/errors.js';

export const reportsRouter = Router();

function assertReportAccess(access: AccessScope): void {
  if (access.selfOnly) {
    throw new ForbiddenError('Reports are limited to management roles');
  }
}

function parseReportDate(value: string, field: string): Date {
  const text = validate(dateOnlySchema, value);
  const parsed = new Date(`${text}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== text) {
    throw new ValidationError([{ path: [field], message: 'Tanggal tidak valid.' }]);
  }
  return parsed;
}

function defaultRange(input: { from?: string; to?: string }) {
  const to = input.to ? parseReportDate(input.to, 'to') : todayDateOnly();
  const from = input.from ? parseReportDate(input.from, 'from') : addDays(to, -29);
  if (to < from) {
    throw new ValidationError([{ path: ['to'], message: 'Tanggal akhir harus setelah tanggal mulai.' }]);
  }
  return { from, to };
}

async function reservationRows(
  filter: { from: Date; to: Date; dormitoryId?: string },
  access: AccessScope,
  paging: { skip: number; take: number },
): Promise<{ total: number; rows: ReportReservationRow[] }> {
  const where: Prisma.ReservationWhereInput = {
    checkInDate: { lte: filter.to },
    checkOutDate: { gte: filter.from },
    ...(filter.dormitoryId ? { dormitoryId: filter.dormitoryId } : {}),
    ...(access.global ? {} : readableReservationWhere(access)),
  };
  const [total, rows] = await Promise.all([
    prisma.reservation.count({ where }),
    prisma.reservation.findMany({
      where,
      include: { primaryEmployee: true, dormitory: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      skip: paging.skip,
      take: paging.take,
    }),
  ]);
  return {
    total,
    rows: rows.map((row) => ({
      id: row.id,
      bookingCode: row.bookingCode,
      employeeName: row.primaryEmployee?.fullName ?? 'Unknown',
      dormitoryName: row.dormitory.name,
      checkInDate: formatDateOnly(row.checkInDate),
      checkOutDate: formatDateOnly(row.checkOutDate),
      status: row.status,
      source: row.source,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

async function occupancyRows(
  access: AccessScope,
  dormitoryId?: string,
  asOf: Date = todayDateOnly(),
): Promise<OccupancyReportRow[]> {
  const buildingOnly = access.buildingIds.length > 0 && access.dormitoryIds.length === 0;
  const dormitories = await prisma.dormitory.findMany({
    where: {
      status: 'ACTIVE',
      ...(dormitoryId ? { id: dormitoryId } : {}),
      ...(access.global ? {} : readableDormitoryWhere(access)),
    },
    orderBy: { name: 'asc' },
    include: {
      buildings: {
        where: buildingOnly ? { id: { in: access.buildingIds } } : { status: 'ACTIVE' },
        include: {
          floors: {
            include: {
              rooms: {
                where: { operationalStatus: 'ACTIVE' },
                include: { beds: { where: { status: 'ACTIVE' }, select: { id: true } } },
              },
            },
          },
        },
      },
    },
  });

  const today = asOf;
  const allocations = await prisma.bedAllocation.findMany({
    where: {
      status: { in: ['HELD', 'ACTIVE'] },
      stayStart: { lte: today },
      stayEnd: { gt: today },
      bed: {
        room: {
          operationalStatus: 'ACTIVE',
          floor: {
            building: { dormitoryId: { in: dormitories.map((item) => item.id) }, status: 'ACTIVE' },
            ...(buildingOnly ? { buildingId: { in: access.buildingIds } } : {}),
          },
        },
      },
    },
    select: {
      bedId: true,
      bed: { select: { room: { select: { floor: { select: { building: { select: { dormitoryId: true } } } } } } } },
    },
  });
  const occupiedByDormitory = new Map<string, Set<string>>();
  for (const allocation of allocations) {
    const id = allocation.bed.room.floor.building.dormitoryId;
    if (!occupiedByDormitory.has(id)) occupiedByDormitory.set(id, new Set());
    occupiedByDormitory.get(id)!.add(allocation.bedId);
  }

  return dormitories.map((dormitory) => {
    const totalBeds = dormitory.buildings.reduce(
      (sum, building) =>
        sum +
        building.floors.reduce(
          (floorSum, floor) =>
            floorSum + floor.rooms.reduce((roomSum, room) => roomSum + room.beds.length, 0),
          0,
        ),
      0,
    );
    const occupiedBeds = occupiedByDormitory.get(dormitory.id)?.size ?? 0;
    return {
      dormitoryId: dormitory.id,
      dormitoryName: dormitory.name,
      totalBeds,
      occupiedBeds,
      availableBeds: Math.max(0, totalBeds - occupiedBeds),
      occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0,
    };
  });
}

async function operationalRows(
  access: AccessScope,
  dormitoryId?: string,
): Promise<OperationalReportRow[]> {
  const reservationScope: Prisma.ReservationWhereInput = {
    ...(dormitoryId ? { dormitoryId } : {}),
    ...(access.global ? {} : readableReservationWhere(access)),
  };
  const roomScope: Prisma.HousekeepingTaskWhereInput = {
    AND: [
      ...(dormitoryId ? [{ room: { floor: { building: { dormitoryId } } } }] : []),
      ...(access.global ? [] : [{ room: readableRoomWhere(access) }]),
    ],
  };
  const ticketScope: Prisma.MaintenanceTicketWhereInput = {
    AND: [
      ...(dormitoryId
        ? [
            {
              OR: [
                { room: { floor: { building: { dormitoryId } } } },
                { bed: { room: { floor: { building: { dormitoryId } } } } },
              ],
            } satisfies Prisma.MaintenanceTicketWhereInput,
          ]
        : []),
      ...(access.global
        ? []
        : [
            {
              OR: [
                { room: readableRoomWhere(access) },
                { bed: { room: readableRoomWhere(access) } },
              ],
            } satisfies Prisma.MaintenanceTicketWhereInput,
          ]),
    ],
  };

  const [reservations, housekeeping, maintenance] = await Promise.all([
    prisma.reservation.groupBy({ by: ['status'], where: reservationScope, _count: { _all: true } }),
    prisma.housekeepingTask.groupBy({ by: ['status'], where: roomScope, _count: { _all: true } }),
    prisma.maintenanceTicket.groupBy({
      by: ['status'],
      where: ticketScope,
      _count: { _all: true },
    }),
  ]);

  return [
    ...reservations.map((row) => ({
      category: 'RESERVATION',
      label: row.status,
      value: row._count._all,
    })),
    ...housekeeping.map((row) => ({
      category: 'HOUSEKEEPING',
      label: row.status,
      value: row._count._all,
    })),
    ...maintenance.map((row) => ({
      category: 'MAINTENANCE',
      label: row.status,
      value: row._count._all,
    })),
  ];
}

function csvEscape(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) lines.push(row.map(csvEscape).join(','));
  return `${lines.join('\n')}\n`;
}

async function toXlsx(
  sheet: string,
  headers: string[],
  rows: Array<Array<string | number>>,
): Promise<Buffer> {
  const data = [
    headers.map((header) => ({
      value: header,
      fontWeight: 'bold' as const,
      backgroundColor: '#F3F1ED',
    })),
    ...rows.map((row) => row.map((value) => ({ value }))),
  ];
  const file = await writeXlsxFile(data, {
    sheet,
    stickyRowsCount: 1,
    columns: headers.map((header) => ({
      width: Math.min(48, Math.max(14, header.length + 6)),
    })),
  });
  return file.toBuffer();
}

reportsRouter.get('/reports/reservations', requirePermission('reports.read'), async (req, res) => {
  assertReportAccess(req.access!);
  const query = validate(reportQuerySchema, req.query);
  const paging = validate(
    createPaginationQuerySchema({ pageSize: 25, maxPageSize: 100 }),
    req.query,
  );
  const range = defaultRange(query);
  const { total, rows } = await reservationRows(
    { ...range, dormitoryId: query.dormitoryId },
    req.access!,
    { skip: (paging.page - 1) * paging.pageSize, take: paging.pageSize },
  );
  const pagination = paginationMeta(total, paging.page, paging.pageSize);
  sendSuccess(
    res,
    {
      items: rows,
      filters: {
        from: formatDateOnly(range.from),
        to: formatDateOnly(range.to),
        dormitoryId: query.dormitoryId ?? null,
      },
      pagination,
    },
    { pagination },
  );
});

reportsRouter.get('/reports/occupancy', requirePermission('reports.read'), async (req, res) => {
  assertReportAccess(req.access!);
  const query = validate(reportQuerySchema, req.query);
  const range = defaultRange(query);
  const asOf = query.to ? range.to : query.from ? range.from : todayDateOnly();
  const rows = await occupancyRows(req.access!, query.dormitoryId, asOf);
  const totalBeds = rows.reduce((sum, row) => sum + row.totalBeds, 0);
  const occupiedBeds = rows.reduce((sum, row) => sum + row.occupiedBeds, 0);
  sendSuccess(res, {
    items: rows,
    totals: {
      totalBeds,
      occupiedBeds,
      availableBeds: Math.max(0, totalBeds - occupiedBeds),
      occupancyRate: totalBeds ? Math.round((occupiedBeds / totalBeds) * 1000) / 10 : 0,
    },
    asOf: formatDateOnly(asOf),
    generatedAt: new Date().toISOString(),
  });
});

reportsRouter.get('/reports/operational', requirePermission('reports.read'), async (req, res) => {
  assertReportAccess(req.access!);
  const query = validate(reportQuerySchema, req.query);
  const rows = await operationalRows(req.access!, query.dormitoryId);
  sendSuccess(res, { items: rows, generatedAt: new Date().toISOString() });
});

reportsRouter.get('/reports/export', requirePermission('reports.export'), async (req, res) => {
  assertReportAccess(req.access!);
  const query = validate(reportQuerySchema, req.query);
  const range = defaultRange(query);
  const asOf = query.to ? range.to : query.from ? range.from : todayDateOnly();
  const reportType = typeof req.query.type === 'string' ? req.query.type : 'reservations';
  const format = req.query.format === 'xlsx' ? 'xlsx' : 'csv';
  const access = req.access!;
  let headers: string[];
  let rows: Array<Array<string | number>>;
  let sheet: string;
  let fileStem: string;
  let truncated = false;
  let totalAvailable = 0;
  if (reportType === 'occupancy') {
    const occupancy = await occupancyRows(access, query.dormitoryId, asOf);
    headers = ['Dormitory', 'Total Beds', 'Occupied Beds', 'Available Beds', 'Occupancy %'];
    rows = occupancy.map((row) => [
      row.dormitoryName,
      row.totalBeds,
      row.occupiedBeds,
      row.availableBeds,
      row.occupancyRate,
    ]);
    sheet = 'Occupancy';
    fileStem = `whoosh-stay-occupancy-${formatDateOnly(todayDateOnly())}`;
  } else if (reportType === 'operational') {
    const operational = await operationalRows(access, query.dormitoryId);
    headers = ['Category', 'Status', 'Count'];
    rows = operational.map((row) => [row.category, row.label, row.value]);
    sheet = 'Operational';
    fileStem = `whoosh-stay-operational-${formatDateOnly(todayDateOnly())}`;
  } else {
    const exportLimit = 5000;
    const { rows: reservations, total } = await reservationRows(
      { ...range, dormitoryId: query.dormitoryId },
      access,
      { skip: 0, take: exportLimit },
    );
    truncated = total > reservations.length;
    totalAvailable = total;
    headers = [
      'Booking Code',
      'Crew',
      'Dormitory',
      'Check In',
      'Check Out',
      'Status',
      'Source',
      'Created',
    ];
    rows = reservations.map((row) => [
      row.bookingCode,
      row.employeeName,
      row.dormitoryName,
      row.checkInDate,
      row.checkOutDate,
      row.status,
      row.source,
      row.createdAt,
    ]);
    sheet = 'Reservations';
    fileStem = `whoosh-stay-reservations-${formatDateOnly(todayDateOnly())}`;
  }

  if (reportType === 'occupancy' || reportType === 'operational') {
    totalAvailable = rows.length;
  }

  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'REPORT_EXPORT',
    entityType: 'REPORT',
    afterData: {
      type: reportType,
      format: format.toUpperCase(),
      rowCount: rows.length,
      truncated,
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.setHeader('X-Export-Truncated', truncated ? 'true' : 'false');
  res.setHeader('X-Export-Row-Count', String(rows.length));
  res.setHeader('X-Export-Total', String(totalAvailable));
  if (format === 'xlsx') {
    const workbook = await toXlsx(sheet, headers, rows);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.xlsx"`);
    res.send(workbook);
    return;
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileStem}.csv"`);
  res.send(toCsv(headers, rows));
});

