import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import writeXlsxFile from 'write-excel-file/node';
import {
  createLocationSchema,
  createPaginationQuerySchema,
  createRoomTypeSchema,
  updateLocationSchema,
  updateRoomTypeSchema,
  type FacilitySummary,
  type LocationSummary,
  type RoomTypeSummary,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';
import type { AccessScope } from '../auth/types.js';
import { readableDormitoryWhere, readableRoomWhere } from '../../lib/scope.js';

export const masterDataRouter = Router();

const idSchema = z.uuid();
const statusFilterSchema = z.enum(['ACTIVE', 'INACTIVE']).optional();
const masterQuerySchema = createPaginationQuerySchema({ pageSize: 15, maxPageSize: 100 });

function readStatus(value: unknown) {
  return statusFilterSchema.parse(typeof value === 'string' && value ? value : undefined);
}

masterDataRouter.get(
  '/master-data/locations',
  requirePermission('locations.read'),
  async (req, res) => {
    const query = validate(masterQuerySchema, req.query);
    const status = readStatus(req.query.status);
    const where: Prisma.LocationWhereInput = {
      ...(status ? { status } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, locations] = await Promise.all([
      prisma.location.count({ where }),
      prisma.location.findMany({
        where,
        include: { _count: { select: { dormitories: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items: LocationSummary[] = locations.map((location) => ({
      id: location.id,
      code: location.code,
      name: location.name,
      description: location.description,
      address: location.address,
      status: location.status,
      dormitoryCount: location._count.dormitories,
      createdAt: location.createdAt.toISOString(),
      updatedAt: location.updatedAt.toISOString(),
    }));
    const pagination = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items, pagination }, { pagination });
  },
);

masterDataRouter.post(
  '/master-data/locations',
  requirePermission('locations.manage'),
  async (req, res) => {
    if (!req.access!.global) {
      throw new ForbiddenError('Managing the location master requires a global scope');
    }
    const input = validate(createLocationSchema, req.body);
    const code = input.code.toUpperCase();
    const duplicate = await prisma.location.findUnique({ where: { code } });
    if (duplicate) {
      throw new ConflictError('CONFLICT', 'Kode lokasi sudah digunakan.');
    }
    const location = await prisma.location.create({
      data: {
        ...input,
        code,
        createdBy: req.auth!.user.id,
        updatedBy: req.auth!.user.id,
      },
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'LOCATION_CREATE',
      entityType: 'LOCATION',
      entityId: location.id,
      afterData: { code: location.code, name: location.name, status: location.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, location, { status: 201 });
  },
);

masterDataRouter.patch(
  '/master-data/locations/:id',
  requirePermission('locations.manage'),
  async (req, res) => {
    if (!req.access!.global) {
      throw new ForbiddenError('Managing the location master requires a global scope');
    }
    const id = validate(idSchema, req.params.id);
    const input = validate(updateLocationSchema, req.body);
    const existing = await prisma.location.findUnique({
      where: { id },
      include: { _count: { select: { dormitories: true } } },
    });
    if (!existing) throw new NotFoundError('Location not found');

    if (input.code) {
      const code = input.code.toUpperCase();
      const duplicate = await prisma.location.findFirst({
        where: { code, id: { not: id } },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError('CONFLICT', 'Kode lokasi sudah digunakan.');
      }
      input.code = code;
    }

    if (input.status === 'INACTIVE' && existing._count.dormitories > 0) {
      const activeDormitories = await prisma.dormitory.count({
        where: { locationId: id, status: 'ACTIVE' },
      });
      if (activeDormitories > 0) {
        throw new ConflictError(
          'CONFLICT',
          'Location is still used by active dormitories',
        );
      }
    }

    const updated = await prisma.location.update({
      where: { id },
      data: { ...input, updatedBy: req.auth!.user.id },
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'LOCATION_UPDATE',
      entityType: 'LOCATION',
      entityId: id,
      beforeData: { name: existing.name, status: existing.status },
      afterData: input as Prisma.InputJsonObject,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, updated);
  },
);

masterDataRouter.get(
  '/master-data/room-types',
  requirePermission('rooms.read'),
  async (req, res) => {
    const query = validate(masterQuerySchema, req.query);
    const status = readStatus(req.query.status);
    const where: Prisma.RoomTypeWhereInput = {
      ...(status ? { status } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, types] = await Promise.all([
      prisma.roomType.count({ where }),
      prisma.roomType.findMany({
        where,
        include: { _count: { select: { rooms: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);

    const items: RoomTypeSummary[] = types.map((type) => ({
      id: type.id,
      code: type.code,
      name: type.name,
      description: type.description,
      defaultCapacity: type.defaultCapacity,
      status: type.status,
      roomCount: type._count.rooms,
    }));
    const pagination = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items, pagination }, { pagination });
  },
);

masterDataRouter.post(
  '/master-data/room-types',
  requirePermission('rooms.create'),
  async (req, res) => {
    if (!req.access!.global) {
      throw new ForbiddenError('Managing the global room-type catalog requires a global scope');
    }
    const input = validate(createRoomTypeSchema, req.body);
    const duplicate = await prisma.roomType.findUnique({ where: { code: input.code } });
    if (duplicate) {
      throw new ConflictError('CONFLICT', 'Kode tipe kamar sudah digunakan.');
    }
    const type = await prisma.roomType.create({ data: input });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ROOM_TYPE_CREATE',
      entityType: 'ROOM_TYPE',
      entityId: type.id,
      afterData: { code: type.code, name: type.name, status: type.status },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, type, { status: 201 });
  },
);

masterDataRouter.patch(
  '/master-data/room-types/:id',
  requirePermission('rooms.update'),
  async (req, res) => {
    if (!req.access!.global) {
      throw new ForbiddenError('Managing the global room-type catalog requires a global scope');
    }
    const id = validate(idSchema, req.params.id);
    const input = validate(updateRoomTypeSchema, req.body);
    const existing = await prisma.roomType.findUnique({
      where: { id },
      include: { _count: { select: { rooms: true } } },
    });
    if (!existing) throw new NotFoundError('Room type not found');

    if (input.status === 'INACTIVE' && existing._count.rooms > 0) {
      const activeRooms = await prisma.room.count({
        where: { roomTypeId: id, operationalStatus: { in: ['ACTIVE', 'MAINTENANCE'] } },
      });
      if (activeRooms > 0) {
        throw new ConflictError(
          'CONFLICT',
          'Room type is still used by active or maintenance rooms',
        );
      }
    }

    const updated = await prisma.roomType.update({ where: { id }, data: input });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ROOM_TYPE_UPDATE',
      entityType: 'ROOM_TYPE',
      entityId: id,
      beforeData: { name: existing.name, status: existing.status },
      afterData: input as Prisma.InputJsonObject,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, updated);
  },
);

masterDataRouter.get(
  '/master-data/facilities',
  requirePermission('dormitories.read'),
  async (req, res) => {
    const query = validate(masterQuerySchema, req.query);
    const status = readStatus(req.query.status);
    const where: Prisma.FacilityWhereInput = {
      ...(status ? { status } : {}),
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [total, facilities] = await Promise.all([
      prisma.facility.count({ where }),
      prisma.facility.findMany({
        where,
        include: { _count: { select: { roomFacilities: true } } },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items: FacilitySummary[] = facilities.map((facility) => ({
      id: facility.id,
      code: facility.code,
      name: facility.name,
      description: facility.description,
      status: facility.status,
      roomCount: facility._count.roomFacilities,
    }));
    const pagination = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items, pagination }, { pagination });
  },
);

masterDataRouter.get(
  '/master-data/buildings',
  requirePermission('dormitories.read'),
  async (req, res) => {
    const query = validate(masterQuerySchema, req.query);
    const status = readStatus(req.query.status);
    const dormitoryWhere = readableDormitoryWhere(req.access!);
    const where: Prisma.BuildingWhereInput = {
      ...(status ? { status } : {}),
      dormitory: dormitoryWhere,
      ...(query.q
        ? {
            OR: [
              { code: { contains: query.q, mode: 'insensitive' } },
              { name: { contains: query.q, mode: 'insensitive' } },
              { dormitory: { name: { contains: query.q, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [total, buildings] = await Promise.all([
      prisma.building.count({ where }),
      prisma.building.findMany({
        where,
        include: {
          dormitory: { select: { id: true, code: true, name: true } },
          floors: { select: { id: true, _count: { select: { rooms: true } } } },
        },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items = buildings.map((building) => ({
      id: building.id,
      code: building.code,
      name: building.name,
      status: building.status,
      dormitoryId: building.dormitory.id,
      dormitoryName: building.dormitory.name,
      floorCount: building.floors.length,
      roomCount: building.floors.reduce((sum, floor) => sum + floor._count.rooms, 0),
    }));
    const pagination = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items, pagination }, { pagination });
  },
);

masterDataRouter.get(
  '/master-data/rooms',
  requirePermission('rooms.read'),
  async (req, res) => {
    const query = validate(masterQuerySchema, req.query);
    const status = readStatus(req.query.status);
    const where: Prisma.RoomWhereInput = {
      AND: [
        ...(status ? [{ operationalStatus: status }] : []),
        readableRoomWhere(req.access!),
        ...(query.q
          ? [
              {
                OR: [
                  { roomNumber: { contains: query.q, mode: 'insensitive' as const } },
                  { name: { contains: query.q, mode: 'insensitive' as const } },
                  { roomType: { name: { contains: query.q, mode: 'insensitive' as const } } },
                  {
                    floor: {
                      building: { name: { contains: query.q, mode: 'insensitive' as const } },
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    };
    const [total, rooms] = await Promise.all([
      prisma.room.count({ where }),
      prisma.room.findMany({
        where,
        include: {
          roomType: { select: { name: true } },
          floor: {
            select: {
              floorNumber: true,
              name: true,
              building: { select: { name: true, dormitory: { select: { name: true } } } },
            },
          },
          _count: { select: { beds: true } },
        },
        orderBy: [{ roomNumber: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items = rooms.map((room) => ({
      id: room.id,
      roomNumber: room.roomNumber,
      name: room.name,
      status: room.operationalStatus,
      housekeepingStatus: room.housekeepingStatus,
      roomTypeName: room.roomType.name,
      buildingName: room.floor.building.name,
      dormitoryName: room.floor.building.dormitory.name,
      floorNumber: room.floor.floorNumber,
      bedCount: room._count.beds,
    }));
    const pagination = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items, pagination }, { pagination });
  },
);

masterDataRouter.get(
  '/master-data/beds',
  requirePermission('rooms.read'),
  async (req, res) => {
    const query = validate(masterQuerySchema, req.query);
    const status = readStatus(req.query.status);
    const roomScope = readableRoomWhere(req.access!);
    const where: Prisma.BedWhereInput = {
      AND: [
        ...(status ? [{ status }] : []),
        ...(Object.keys(roomScope).length > 0 ? [{ room: roomScope }] : []),
        ...(query.q
          ? [
              {
                OR: [
                  { bedCode: { contains: query.q, mode: 'insensitive' as const } },
                  { label: { contains: query.q, mode: 'insensitive' as const } },
                  { room: { roomNumber: { contains: query.q, mode: 'insensitive' as const } } },
                ],
              },
            ]
          : []),
      ],
    };
    const [total, beds] = await Promise.all([
      prisma.bed.count({ where }),
      prisma.bed.findMany({
        where,
        include: {
          room: {
            select: {
              roomNumber: true,
              floor: {
                select: { building: { select: { name: true, dormitory: { select: { name: true } } } } },
              },
            },
          },
        },
        orderBy: [{ bedCode: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const items = beds.map((bed) => ({
      id: bed.id,
      bedCode: bed.bedCode,
      label: bed.label,
      status: bed.status,
      housekeepingStatus: bed.housekeepingStatus,
      roomNumber: bed.room.roomNumber,
      buildingName: bed.room.floor.building.name,
      dormitoryName: bed.room.floor.building.dormitory.name,
    }));
    const pagination = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items, pagination }, { pagination });
  },
);

masterDataRouter.get(
  '/master-data/organization',
  requirePermission('employees.read'),
  async (_req, res) => {
    const [departments, positions, stations, employmentStatuses, totals] = await Promise.all([
      prisma.employee.groupBy({
        by: ['departmentCode', 'departmentName'],
        where: { departmentName: { not: null } },
        _count: { _all: true },
        orderBy: { departmentName: 'asc' },
      }),
      prisma.employee.groupBy({
        by: ['positionCode', 'positionName'],
        where: { positionName: { not: null } },
        _count: { _all: true },
        orderBy: { positionName: 'asc' },
      }),
      prisma.employee.groupBy({
        by: ['homeStationCode'],
        where: { homeStationCode: { not: null } },
        _count: { _all: true },
        orderBy: { homeStationCode: 'asc' },
      }),
      prisma.employee.groupBy({
        by: ['employmentStatus'],
        _count: { _all: true },
        orderBy: { employmentStatus: 'asc' },
      }),
      prisma.employee.aggregate({
        _count: { _all: true },
        _max: { syncedAt: true },
      }),
    ]);

    sendSuccess(res, {
      departments: departments.map((row) => ({
        value: row.departmentCode ?? row.departmentName ?? 'TANPA-KODE',
        label: row.departmentName ?? 'Tanpa nama departemen',
        count: row._count._all,
      })),
      positions: positions.map((row) => ({
        value: row.positionCode ?? row.positionName ?? 'TANPA-KODE',
        label: row.positionName ?? 'Tanpa nama jabatan',
        count: row._count._all,
      })),
      stations: stations.map((row) => ({
        value: row.homeStationCode ?? 'TANPA-KODE',
        label: row.homeStationCode ?? 'Tanpa stasiun',
        count: row._count._all,
      })),
      employmentStatuses: employmentStatuses.map((row) => ({
        value: row.employmentStatus,
        label: row.employmentStatus,
        count: row._count._all,
      })),
      employeeCount: totals._count._all,
      lastSyncedAt: totals._max.syncedAt?.toISOString() ?? null,
      sourceSystem: 'DEMO',
      readOnly: true,
    });
  },
);

const exportEntitySchema = z.enum([
  'locations',
  'dormitories',
  'buildings',
  'rooms',
  'beds',
  'room-types',
  'facilities',
  'departments',
  'positions',
]);

interface ExportSheet {
  sheet: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

async function buildExport(
  entity: z.infer<typeof exportEntitySchema>,
  access: AccessScope,
): Promise<ExportSheet> {
  switch (entity) {
    case 'locations': {
      const items = await prisma.location.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { dormitories: true } } },
      });
      return {
        sheet: 'Lokasi',
        headers: ['Kode', 'Nama', 'Status', 'Alamat', 'Jumlah dormitory', 'Deskripsi'],
        rows: items.map((item) => [
          item.code,
          item.name,
          item.status,
          item.address ?? '',
          item._count.dormitories,
          item.description ?? '',
        ]),
      };
    }
    case 'dormitories': {
      const items = await prisma.dormitory.findMany({
        where: readableDormitoryWhere(access),
        orderBy: { name: 'asc' },
        include: {
          buildings: {
            select: { id: true, floors: { select: { _count: { select: { rooms: true } } } } },
          },
        },
      });
      return {
        sheet: 'Dormitory',
        headers: ['Kode', 'Nama', 'Status', 'Stasiun', 'Alamat', 'Gedung', 'Kamar'],
        rows: items.map((item) => [
          item.code,
          item.name,
          item.status,
          item.stationCode ?? '',
          item.address ?? '',
          item.buildings.length,
          item.buildings.reduce((sum, building) => sum + building.floors.reduce((n, floor) => n + floor._count.rooms, 0), 0),
        ]),
      };
    }
    case 'buildings': {
      const items = await prisma.building.findMany({
        where: { dormitory: readableDormitoryWhere(access) },
        orderBy: [{ name: 'asc' }],
        include: { dormitory: { select: { name: true } }, floors: { select: { _count: { select: { rooms: true } } } } },
      });
      return {
        sheet: 'Gedung',
        headers: ['Kode', 'Nama', 'Dormitory', 'Status', 'Jumlah lantai', 'Jumlah kamar'],
        rows: items.map((item) => [
          item.code,
          item.name,
          item.dormitory.name,
          item.status,
          item.floors.length,
          item.floors.reduce((sum, floor) => sum + floor._count.rooms, 0),
        ]),
      };
    }
    case 'rooms': {
      const items = await prisma.room.findMany({
        where: readableRoomWhere(access),
        orderBy: [{ roomNumber: 'asc' }],
        include: {
          roomType: { select: { name: true } },
          floor: { select: { floorNumber: true, building: { select: { name: true, dormitory: { select: { name: true } } } } } },
          _count: { select: { beds: true } },
        },
      });
      return {
        sheet: 'Kamar',
        headers: ['Nomor', 'Nama', 'Dormitory', 'Gedung', 'Lantai', 'Tipe kamar', 'Status', 'Kesiapan', 'Jumlah bed'],
        rows: items.map((item) => [
          item.roomNumber,
          item.name ?? '',
          item.floor.building.dormitory.name,
          item.floor.building.name,
          item.floor.floorNumber,
          item.roomType.name,
          item.operationalStatus,
          item.housekeepingStatus,
          item._count.beds,
        ]),
      };
    }
    case 'beds': {
      const items = await prisma.bed.findMany({
        where: { room: readableRoomWhere(access) },
        orderBy: [{ bedCode: 'asc' }],
        include: { room: { select: { roomNumber: true, floor: { select: { building: { select: { name: true, dormitory: { select: { name: true } } } } } } } } },
      });
      return {
        sheet: 'Tempat Tidur',
        headers: ['Kode bed', 'Label', 'Kamar', 'Gedung', 'Dormitory', 'Status', 'Kesiapan'],
        rows: items.map((item) => [
          item.bedCode,
          item.label ?? '',
          item.room.roomNumber,
          item.room.floor.building.name,
          item.room.floor.building.dormitory.name,
          item.status,
          item.housekeepingStatus,
        ]),
      };
    }
    case 'room-types': {
      const items = await prisma.roomType.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { rooms: true } } },
      });
      return {
        sheet: 'Tipe Kamar',
        headers: ['Kode', 'Nama', 'Kapasitas', 'Status', 'Jumlah kamar', 'Deskripsi'],
        rows: items.map((item) => [item.code, item.name, item.defaultCapacity, item.status, item._count.rooms, item.description ?? '']),
      };
    }
    case 'facilities': {
      const items = await prisma.facility.findMany({
        orderBy: { name: 'asc' },
        include: { _count: { select: { roomFacilities: true } } },
      });
      return {
        sheet: 'Fasilitas',
        headers: ['Kode', 'Nama', 'Status', 'Dipakai di kamar', 'Deskripsi'],
        rows: items.map((item) => [item.code, item.name, item.status, item._count.roomFacilities, item.description ?? '']),
      };
    }
    case 'departments': {
      const items = await prisma.employee.groupBy({
        by: ['departmentCode', 'departmentName'],
        where: { departmentName: { not: null } },
        _count: { _all: true },
        orderBy: { departmentName: 'asc' },
      });
      return {
        sheet: 'Departemen',
        headers: ['Kode', 'Nama', 'Jumlah karyawan'],
        rows: items.map((item) => [item.departmentCode ?? '', item.departmentName ?? '', item._count._all]),
      };
    }
    case 'positions': {
      const items = await prisma.employee.groupBy({
        by: ['positionCode', 'positionName'],
        where: { positionName: { not: null } },
        _count: { _all: true },
        orderBy: { positionName: 'asc' },
      });
      return {
        sheet: 'Jabatan',
        headers: ['Kode', 'Nama', 'Jumlah karyawan'],
        rows: items.map((item) => [item.positionCode ?? '', item.positionName ?? '', item._count._all]),
      };
    }
  }
}

masterDataRouter.get(
  '/master-data/export',
  requirePermission('reports.export'),
  async (req, res) => {
    const entity = validate(exportEntitySchema, req.query.entity);
    if (!req.access?.global && !req.access?.dormitoryIds.length && !req.access?.buildingIds.length) {
      throw new ForbiddenError('No data scope is available for export');
    }
    if (entity === 'departments' || entity === 'positions' || entity === 'locations') {
      if (!req.access?.global) {
        throw new ForbiddenError('Global master data export requires global scope');
      }
    }
    const { sheet, headers, rows } = await buildExport(entity, req.access!);
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
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'MASTER_DATA_EXPORT',
      entityType: 'MASTER_DATA',
      afterData: { entity, rows: rows.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="whoosh-stay-${entity}-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );
    const buffer = await file.toBuffer();
    res.send(buffer);
  },
);
