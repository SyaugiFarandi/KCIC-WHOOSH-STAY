import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  createBedSchema,
  createBuildingSchema,
  createDormitorySchema,
  createFacilitySchema,
  createFloorSchema,
  createPaginationQuerySchema,
  createRoomSchema,
  updateBedSchema,
  updateBuildingSchema,
  updateDormitorySchema,
  updateFacilitySchema,
  updateRoomSchema,
  type BedSummary,
  type DormitoryDetail,
  type DormitorySummary,
  type RoomSummary,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';
import { assertManageDormitory, assertRoomScope, readableDormitoryWhere } from '../../lib/scope.js';
import { todayDateOnly } from '../../lib/dates.js';

export const inventoryRouter = Router();

const idSchema = z.uuid();

const dormitoryInclude = {
  location: { select: { id: true, name: true } },
  buildings: {
    include: {
      floors: {
        include: {
          rooms: {
            include: { beds: true, roomType: true },
            orderBy: { roomNumber: 'asc' },
          },
        },
        orderBy: { floorNumber: 'asc' },
      },
    },
    orderBy: { code: 'asc' },
  },
} satisfies Prisma.DormitoryInclude;

type DormitoryWithTree = Prisma.DormitoryGetPayload<{ include: typeof dormitoryInclude }>;

function mapBed(bed: DormitoryWithTree['buildings'][number]['floors'][number]['rooms'][number]['beds'][number]): BedSummary {
  return {
    id: bed.id,
    bedCode: bed.bedCode,
    label: bed.label,
    status: bed.status,
    housekeepingStatus: bed.housekeepingStatus,
  };
}

function mapRoom(
  room: DormitoryWithTree['buildings'][number]['floors'][number]['rooms'][number],
  building: { id: string; name: string },
  floorNumber: number,
): RoomSummary {
  return {
    id: room.id,
    roomNumber: room.roomNumber,
    name: room.name,
    floorNumber,
    buildingId: building.id,
    buildingName: building.name,
    roomTypeName: room.roomType.name,
    genderPolicy: room.genderPolicy,
    operationalStatus: room.operationalStatus,
    housekeepingStatus: room.housekeepingStatus,
    beds: room.beds.map(mapBed),
  };
}

function mapDormitory(dormitory: DormitoryWithTree, availableBedIds?: Set<string>): DormitoryDetail {
  const rooms = dormitory.buildings.flatMap((building) =>
    building.floors.flatMap((floor) =>
      floor.rooms.map((room) => mapRoom(room, building, floor.floorNumber)),
    ),
  );
  const bedCount = rooms.reduce((sum, room) => sum + room.beds.length, 0);
  const availableBedCount =
    availableBedIds === undefined
      ? undefined
      : rooms.reduce(
          (sum, room) => sum + room.beds.filter((bed) => availableBedIds.has(bed.id)).length,
          0,
        );

  return {
    id: dormitory.id,
    code: dormitory.code,
    name: dormitory.name,
    description: dormitory.description,
    address: dormitory.address,
    stationCode: dormitory.stationCode,
    locationId: dormitory.locationId,
    locationName: dormitory.location?.name ?? null,
    contactName: dormitory.contactName,
    contactPhone: dormitory.contactPhone,
    status: dormitory.status,
    buildingCount: dormitory.buildings.length,
    roomCount: rooms.length,
    bedCount,
    ...(availableBedCount !== undefined ? { availableBedCount } : {}),
    buildings: dormitory.buildings.map((building) => ({
      id: building.id,
      code: building.code,
      name: building.name,
      status: building.status,
      floors: building.floors.map((floor) => ({
        id: floor.id,
        floorNumber: floor.floorNumber,
        name: floor.name,
        rooms: floor.rooms.map((room) => mapRoom(room, building, floor.floorNumber)),
      })),
    })),
    facilities: [],
  };
}

function toSummary(detail: DormitoryDetail): DormitorySummary {
  const { buildings: _buildings, facilities: _facilities, ...summary } = detail;
  return summary;
}

async function loadDormitory(id: string): Promise<DormitoryWithTree> {
  const dormitory = await prisma.dormitory.findUnique({ where: { id }, include: dormitoryInclude });
  if (!dormitory) throw new NotFoundError('Dormitory not found');
  return dormitory;
}

async function loadRoom(id: string) {
  const room = await prisma.room.findUnique({
    where: { id },
    include: { floor: { include: { building: true } } },
  });
  if (!room) throw new NotFoundError('Room not found');
  return room;
}

async function loadBed(id: string) {
  const bed = await prisma.bed.findUnique({
    where: { id },
    include: { room: { include: { floor: { include: { building: true } } } } },
  });
  if (!bed) throw new NotFoundError('Bed not found');
  return bed;
}

async function assertNoActiveOccupancy(
  roomId?: string,
  bedId?: string,
  dormitoryId?: string,
): Promise<void> {
  const allocation = await prisma.bedAllocation.findFirst({
    where: {
      status: { in: ['HELD', 'ACTIVE'] },
      stayEnd: { gte: todayDateOnly() },
      ...(roomId ? { bed: { roomId } } : {}),
      ...(bedId ? { bedId } : {}),
      ...(dormitoryId
        ? { bed: { room: { floor: { building: { dormitoryId } } } } }
        : {}),
    },
    select: { id: true },
  });
  if (allocation) {
    throw new ConflictError('CONFLICT', 'Inventory still has active or held allocations');
  }
}

async function assertLocationLink(locationId: string | null | undefined): Promise<void> {
  if (!locationId) return;
  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { id: true, status: true },
  });
  if (!location) {
    throw new ValidationError([{ path: ['locationId'], message: 'Location not found' }]);
  }
  if (location.status !== 'ACTIVE') {
    throw new ValidationError([{ path: ['locationId'], message: 'Location is not active' }]);
  }
}

inventoryRouter.get('/dormitories', requirePermission('dormitories.read'), async (req, res) => {
  const query = validate(createPaginationQuerySchema({ pageSize: 50 }), req.query);
  const { page, pageSize } = query;
  const q = query.q ?? '';
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const scope = readableDormitoryWhere(req.access!);
  const where: Prisma.DormitoryWhereInput = {
    AND: [
      scope,
      req.access!.selfOnly ? { status: 'ACTIVE' } : status ? { status } : {},
      ...(q
        ? [
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { code: { contains: q, mode: 'insensitive' as const } },
                { stationCode: { contains: q, mode: 'insensitive' as const } },
              ],
            },
          ]
        : []),
    ],
  };

  const [total, dormitories] = await Promise.all([
    prisma.dormitory.count({ where }),
    prisma.dormitory.findMany({
      where,
      include: dormitoryInclude,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  sendSuccess(
    res,
    {
      items: dormitories.map((dormitory) => toSummary(mapDormitory(dormitory))),
      pagination: paginationMeta(total, page, pageSize),
    },
    { pagination: paginationMeta(total, page, pageSize) },
  );
});

inventoryRouter.get('/dormitories/:id', requirePermission('dormitories.read'), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const dormitory = await loadDormitory(id);
  const scope = readableDormitoryWhere(req.access!);
  if (!req.access!.global) {
    const allowed = await prisma.dormitory.findFirst({
      where: { id, ...scope },
      select: { id: true },
    });
    if (!allowed) throw new ForbiddenError('Dormitory is outside your scope');
  }
  const facilities = await prisma.facility.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  });
  const detail = mapDormitory(dormitory);
  detail.facilities = facilities;

  if (req.access!.selfOnly) {
    detail.buildings = detail.buildings.map((building) => ({
      ...building,
      floors: building.floors.map((floor) => ({
        ...floor,
        rooms: floor.rooms.filter((room) => room.operationalStatus === 'ACTIVE'),
      })),
    }));
  }
  sendSuccess(res, detail);
});

inventoryRouter.post('/dormitories', requirePermission('dormitories.create'), async (req, res) => {
  if (!req.access!.global) {
    throw new ForbiddenError('Creating dormitories requires a global scope');
  }
  const input = validate(createDormitorySchema, req.body);
  await assertLocationLink(input.locationId);
  const created = await prisma.dormitory.create({
    data: {
      ...input,
      code: input.code.toUpperCase(),
      createdBy: req.auth!.user.id,
      updatedBy: req.auth!.user.id,
    },
    include: dormitoryInclude,
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'DORMITORY_CREATE',
    entityType: 'DORMITORY',
    entityId: created.id,
    afterData: { code: created.code, name: created.name },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, toSummary(mapDormitory(created)), { status: 201 });
});

inventoryRouter.patch('/dormitories/:id', requirePermission('dormitories.update'), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const existing = await loadDormitory(id);
  assertManageDormitory(req.access!, existing.id);
  const input = validate(updateDormitorySchema, req.body);
  if (Object.keys(input).length === 0) throw new ValidationError([{ path: [], message: 'No changes' }]);
  await assertLocationLink(input.locationId);
  const updated = await prisma.dormitory.update({
    where: { id },
    data: { ...input, ...(input.code ? { code: input.code.toUpperCase() } : {}), updatedBy: req.auth!.user.id },
    include: dormitoryInclude,
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'DORMITORY_UPDATE',
    entityType: 'DORMITORY',
    entityId: id,
    beforeData: { name: existing.name, status: existing.status },
    afterData: { name: updated.name, status: updated.status },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, toSummary(mapDormitory(updated)));
});

inventoryRouter.post(
  '/dormitories/:id/deactivate',
  requirePermission('dormitories.deactivate'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const existing = await loadDormitory(id);
    assertManageDormitory(req.access!, existing.id);
    const activeReservations = await prisma.reservation.count({
      where: {
        dormitoryId: id,
        status: { in: ['PENDING_APPROVAL', 'CONFIRMED', 'CHECKED_IN'] },
      },
    });
    if (activeReservations > 0) {
      throw new ConflictError('CONFLICT', 'Resolve active reservations before deactivating this dormitory');
    }
    await assertNoActiveOccupancy(undefined, undefined, id);
    const updated = await prisma.dormitory.update({
      where: { id },
      data: { status: 'INACTIVE', updatedBy: req.auth!.user.id },
      include: dormitoryInclude,
    });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'DORMITORY_DEACTIVATE',
      entityType: 'DORMITORY',
      entityId: id,
      beforeData: { status: existing.status },
      afterData: { status: 'INACTIVE' },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, toSummary(mapDormitory(updated)));
  },
);

inventoryRouter.post(
  '/dormitories/:id/buildings',
  requirePermission('buildings.manage'),
  async (req, res) => {
    const dormitoryId = validate(idSchema, req.params.id);
    const dormitory = await loadDormitory(dormitoryId);
    assertManageDormitory(req.access!, dormitory.id);
    const input = validate(createBuildingSchema, req.body);
    const building = await prisma.building.create({ data: { ...input, dormitoryId } });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'BUILDING_CREATE',
      entityType: 'BUILDING',
      entityId: building.id,
      afterData: { code: building.code, name: building.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, building, { status: 201 });
  },
);

inventoryRouter.patch(
  '/buildings/:id',
  requirePermission('buildings.manage'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const building = await prisma.building.findUnique({ where: { id } });
    if (!building) throw new NotFoundError('Building not found');
    assertManageDormitory(req.access!, building.dormitoryId, building.id);
    const input = validate(updateBuildingSchema, req.body);
    const updated = await prisma.building.update({ where: { id }, data: input });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'BUILDING_UPDATE',
      entityType: 'BUILDING',
      entityId: id,
      afterData: { status: updated.status, name: updated.name },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, updated);
  },
);

inventoryRouter.post('/buildings/:id/floors', requirePermission('floors.manage'), async (req, res) => {
  const buildingId = validate(idSchema, req.params.id);
  const building = await prisma.building.findUnique({ where: { id: buildingId } });
  if (!building) throw new NotFoundError('Building not found');
  assertManageDormitory(req.access!, building.dormitoryId, building.id);
  const input = validate(createFloorSchema, req.body);
  const floor = await prisma.floor.create({ data: { ...input, buildingId } });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'FLOOR_CREATE',
    entityType: 'FLOOR',
    entityId: floor.id,
    afterData: { floorNumber: floor.floorNumber, name: floor.name },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, floor, { status: 201 });
});

inventoryRouter.patch('/floors/:id', requirePermission('floors.manage'), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const floor = await prisma.floor.findUnique({
    where: { id },
    include: { building: true },
  });
  if (!floor) throw new NotFoundError('Floor not found');
  assertManageDormitory(req.access!, floor.building.dormitoryId, floor.buildingId);
  const input = validate(createFloorSchema.partial(), req.body);
  const updated = await prisma.floor.update({ where: { id }, data: input });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'FLOOR_UPDATE',
    entityType: 'FLOOR',
    entityId: id,
    beforeData: { floorNumber: floor.floorNumber, name: floor.name },
    afterData: input as Prisma.InputJsonObject,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, updated);
});

inventoryRouter.post('/floors/:id/rooms', requirePermission('rooms.create'), async (req, res) => {
  const floorId = validate(idSchema, req.params.id);
  const floor = await prisma.floor.findUnique({
    where: { id: floorId },
    include: { building: true },
  });
  if (!floor) throw new NotFoundError('Floor not found');
  assertManageDormitory(req.access!, floor.building.dormitoryId, floor.buildingId);
  const input = validate(createRoomSchema, req.body);

  let roomTypeId = input.roomTypeId;
  if (!roomTypeId) {
    const roomType = input.roomTypeCode
      ? await prisma.roomType.findUnique({ where: { code: input.roomTypeCode } })
      : await prisma.roomType.findFirst({ where: { status: 'ACTIVE' }, orderBy: { name: 'asc' } });
    if (!roomType) throw new ValidationError([{ path: ['roomTypeId'], message: 'Room type not found' }]);
    roomTypeId = roomType.id;
  }

  const room = await prisma.room.create({
    data: {
      floorId,
      roomNumber: input.roomNumber,
      name: input.name,
      roomTypeId,
      genderPolicy: input.genderPolicy,
      description: input.description,
      operationalStatus: 'ACTIVE',
      housekeepingStatus: 'READY',
      ...(input.facilityIds?.length
        ? { roomFacilities: { create: input.facilityIds.map((facilityId) => ({ facilityId })) } }
        : {}),
    },
    include: { beds: true, roomType: true },
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'ROOM_CREATE',
    entityType: 'ROOM',
    entityId: room.id,
    afterData: { roomNumber: room.roomNumber, floorId },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, room, { status: 201 });
});

inventoryRouter.patch('/rooms/:id', requirePermission('rooms.update'), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const room = await loadRoom(id);
  assertRoomScope(req.access!, room);
  const input = validate(updateRoomSchema, req.body);
  if (input.operationalStatus && input.operationalStatus !== 'ACTIVE') {
    await assertNoActiveOccupancy(room.id);
  }
  const updated = await prisma.room.update({
    where: { id },
    data: input,
    include: { floor: { include: { building: true } }, roomType: true, beds: true },
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'ROOM_UPDATE',
    entityType: 'ROOM',
    entityId: id,
    beforeData: { operationalStatus: room.operationalStatus, housekeepingStatus: room.housekeepingStatus },
    afterData: input as Prisma.InputJsonObject,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, {
    id: updated.id,
    roomNumber: updated.roomNumber,
    operationalStatus: updated.operationalStatus,
    housekeepingStatus: updated.housekeepingStatus,
    beds: updated.beds,
  });
});

inventoryRouter.post('/rooms/:id/beds', requirePermission('beds.manage'), async (req, res) => {
  const roomId = validate(idSchema, req.params.id);
  const room = await loadRoom(roomId);
  assertRoomScope(req.access!, room);
  const input = validate(createBedSchema, req.body);
  const bed = await prisma.bed.create({
    data: {
      roomId,
      bedCode: input.bedCode,
      label: input.label,
      status: 'ACTIVE',
      housekeepingStatus: 'READY',
    },
  });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'BED_CREATE',
    entityType: 'BED',
    entityId: bed.id,
    afterData: { bedCode: bed.bedCode, roomId },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, bed, { status: 201 });
});

inventoryRouter.patch('/beds/:id', requirePermission('beds.manage'), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const bed = await loadBed(id);
  assertRoomScope(req.access!, bed.room);
  const input = validate(updateBedSchema, req.body);
  if (input.status && input.status !== 'ACTIVE') {
    await assertNoActiveOccupancy(bed.roomId, bed.id);
  }
  const updated = await prisma.bed.update({ where: { id }, data: input });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'BED_UPDATE',
    entityType: 'BED',
    entityId: id,
    beforeData: { status: bed.status, housekeepingStatus: bed.housekeepingStatus },
    afterData: input as Prisma.InputJsonObject,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, updated);
});

inventoryRouter.get('/facilities', requirePermission('dormitories.read'), async (_req, res) => {
  const items = await prisma.facility.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true },
  });
  sendSuccess(res, { items });
});

inventoryRouter.post('/facilities', requirePermission('facilities.manage'), async (req, res) => {
  if (!req.access!.global) {
    throw new ForbiddenError('Managing the global facility catalog requires a global scope');
  }
  const input = validate(createFacilitySchema, req.body);
  const facility = await prisma.facility.create({ data: input });
  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'FACILITY_CREATE',
    entityType: 'FACILITY',
    entityId: facility.id,
    afterData: { code: facility.code, name: facility.name },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, facility, { status: 201 });
});

inventoryRouter.patch(
  '/facilities/:id',
  requirePermission('facilities.manage'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    if (!req.access!.global) {
      throw new ForbiddenError('Managing the global facility catalog requires a global scope');
    }
    const existing = await prisma.facility.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Facility not found');
    const input = validate(updateFacilitySchema, req.body);
    const updated = await prisma.facility.update({ where: { id }, data: input });
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'FACILITY_UPDATE',
      entityType: 'FACILITY',
      entityId: id,
      beforeData: { name: existing.name, status: existing.status },
      afterData: input as Prisma.InputJsonObject,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, updated);
  },
);
