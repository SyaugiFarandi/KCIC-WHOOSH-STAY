import type {
  BedOccupancyStatus,
  OccupancyConfidence,
  OccupancyDataQuality,
  OccupancyDormitoryRow,
  OccupancyForecastBasis,
  OccupancyForecastResult,
  OccupancyOutOfService,
  OccupancyScopeInfo,
  OccupancyStatusCount,
  OccupancySummary,
  OccupancyTrendResult,
} from '@whoosh/shared';
import { OCCUPANCY_FORMULAS } from '@whoosh/shared';
import type { AccessScope } from '../auth/types.js';
import { prisma } from '../../lib/prisma.js';
import { ForbiddenError } from '../../middleware/errors.js';
import { readableDormitoryWhere } from '../../lib/scope.js';
import {
  addDays,
  formatDateOnly,
  jakartaStartOfDay,
  parseDateOnly,
  todayInJakarta,
} from '../../lib/dates.js';

export interface OccupancyFilter {
  dormitoryId?: string;
  buildingId?: string;
  floorId?: string;
  roomId?: string;
}

interface DatasetBed {
  id: string;
  roomId: string;
  bedStatus: string;
  bedHousekeeping: string;
  roomStatus: string;
  roomHousekeeping: string;
  buildingId: string;
  buildingStatus: string;
  dormitoryId: string;
  dormitoryCode: string;
  dormitoryName: string;
}

interface DatasetDormitory {
  id: string;
  code: string;
  name: string;
}

interface OccupancyDataset {
  capacityBeds: DatasetBed[];
  outOfService: {
    maintenance: number;
    blocked: number;
    inactive: number;
    excluded: number;
    byDormitory: Map<string, OccupancyOutOfService>;
  };
  dormitories: DatasetDormitory[];
}

interface AllocationRow {
  bedId: string;
  status: string;
  stayStart: Date;
  stayEnd: Date;
}

interface BlockRow {
  bedId: string | null;
  roomId: string | null;
  blockType: string;
  startAt: Date;
  endAt: Date;
}

interface BedEvents {
  allocations: AllocationRow[];
  bedBlocks: BlockRow[];
  roomBlocks: BlockRow[];
  openTask: boolean;
}

export interface BedStatusInput {
  allocations: Array<{ status: string }>;
  blockTypes: string[];
  cleaning: boolean;
}

export function classifyBedStatus(input: BedStatusInput): BedOccupancyStatus {
  if (input.blockTypes.some((type) => type === 'OPERATIONAL' || type === 'OTHER')) {
    return 'BLOCKED';
  }
  if (input.blockTypes.length > 0) return 'MAINTENANCE';
  if (input.allocations.some((allocation) => allocation.status === 'ACTIVE')) return 'OCCUPIED';
  if (input.allocations.some((allocation) => allocation.status === 'HELD')) return 'RESERVED';
  if (input.cleaning) return 'CLEANING';
  return 'AVAILABLE';
}

export function occupancyRate(part: number, capacity: number): number | null {
  if (capacity <= 0) return null;
  return Math.round((part / capacity) * 1000) / 10;
}

function scopeInfo(access: AccessScope): OccupancyScopeInfo {
  const level: OccupancyScopeInfo['level'] = access.global
    ? 'global'
    : access.dormitoryIds.length > 0
      ? 'dormitory'
      : 'building';
  return { level, dormitoryIds: access.dormitoryIds, buildingIds: access.buildingIds };
}

function assertManagementScope(access: AccessScope): void {
  if (access.selfOnly) {
    throw new ForbiddenError('Occupancy intelligence requires a management scope');
  }
  if (!access.global && access.dormitoryIds.length === 0 && access.buildingIds.length === 0) {
    throw new ForbiddenError('No accommodation scope is available');
  }
}

function outOfServiceReason(
  roomStatus: string,
  bedStatus: string,
): 'maintenance' | 'blocked' | 'inactive' | null {
  if (roomStatus === 'MAINTENANCE' || bedStatus === 'MAINTENANCE') return 'maintenance';
  if (roomStatus === 'INACTIVE' || bedStatus === 'INACTIVE') return 'inactive';
  if (roomStatus === 'BLOCKED' || bedStatus === 'BLOCKED') return 'blocked';
  return null;
}

async function loadDataset(access: AccessScope, filter: OccupancyFilter): Promise<OccupancyDataset> {
  assertManagementScope(access);
  const dormitoryWhere = readableDormitoryWhere(access);
  const buildingScopedOnly = !access.global && access.buildingIds.length > 0 && access.dormitoryIds.length === 0;

  const dormitories = await prisma.dormitory.findMany({
    where: {
      status: 'ACTIVE',
      ...dormitoryWhere,
      ...(filter.dormitoryId ? { id: filter.dormitoryId } : {}),
      ...(filter.buildingId ? { buildings: { some: { id: filter.buildingId } } } : {}),
      ...(filter.floorId
        ? { buildings: { some: { floors: { some: { id: filter.floorId } } } } }
        : {}),
      ...(filter.roomId
        ? {
            buildings: {
              some: { floors: { some: { rooms: { some: { id: filter.roomId } } } } },
            },
          }
        : {}),
    },
    include: {
      buildings: {
        where: {
          ...(buildingScopedOnly ? { id: { in: access.buildingIds } } : {}),
          ...(filter.buildingId ? { id: filter.buildingId } : {}),
        },
        include: {
          floors: {
            where: { ...(filter.floorId ? { id: filter.floorId } : {}) },
            include: {
              rooms: {
                where: { ...(filter.roomId ? { id: filter.roomId } : {}) },
                include: { beds: true },
              },
            },
          },
        },
      },
    },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
  });

  if (filter.dormitoryId && dormitories.length === 0) {
    throw new ForbiddenError('Dormitory is outside your scope');
  }

  const outOfService = {
    maintenance: 0,
    blocked: 0,
    inactive: 0,
    excluded: 0,
    byDormitory: new Map<string, OccupancyOutOfService>(),
  };
  const capacityBeds: DatasetBed[] = [];
  const meta: DatasetDormitory[] = [];
  let matchedBuilding = !filter.buildingId;
  let matchedFloor = !filter.floorId;
  let matchedRoom = !filter.roomId;

  for (const dormitory of dormitories) {
    meta.push({ id: dormitory.id, code: dormitory.code, name: dormitory.name });
    const dormOutOfService = { maintenance: 0, blocked: 0, inactive: 0 };
    outOfService.byDormitory.set(dormitory.id, dormOutOfService);

    for (const building of dormitory.buildings) {
      if (!buildingScopedOnly || access.buildingIds.includes(building.id)) matchedBuilding = true;
      for (const floor of building.floors) {
        matchedFloor = true;
        for (const room of floor.rooms) {
          matchedRoom = true;
          for (const bed of room.beds) {
            if (bed.status === 'ACTIVE' && room.operationalStatus === 'ACTIVE') {
              if (building.status !== 'ACTIVE') {
                outOfService.excluded += 1;
                continue;
              }
              capacityBeds.push({
                id: bed.id,
                roomId: room.id,
                bedStatus: bed.status,
                bedHousekeeping: bed.housekeepingStatus,
                roomStatus: room.operationalStatus,
                roomHousekeeping: room.housekeepingStatus,
                buildingId: building.id,
                buildingStatus: building.status,
                dormitoryId: dormitory.id,
                dormitoryCode: dormitory.code,
                dormitoryName: dormitory.name,
              });
              continue;
            }
            if (building.status !== 'ACTIVE') {
              outOfService.excluded += 1;
              continue;
            }
            const reason = outOfServiceReason(room.operationalStatus, bed.status);
            if (!reason) continue;
            outOfService[reason] += 1;
            dormOutOfService[reason] += 1;
          }
        }
      }
    }
  }

  if (filter.buildingId && !matchedBuilding) {
    throw new ForbiddenError('Building is outside your scope');
  }
  if (filter.floorId && !matchedFloor) {
    throw new ForbiddenError('Floor is outside your scope');
  }
  if (filter.roomId && !matchedRoom) {
    throw new ForbiddenError('Room is outside your scope');
  }

  return { capacityBeds, outOfService, dormitories: meta };
}

function toDayEnd(date: string): Date {
  return addDays(parseDateOnly(date), 1);
}

async function loadEvents(
  beds: DatasetBed[],
  from: string,
  to: string,
): Promise<Map<string, BedEvents>> {
  const map = new Map<string, BedEvents>();
  if (beds.length === 0) return map;
  const bedIds = beds.map((bed) => bed.id);
  const roomIds = [...new Set(beds.map((bed) => bed.roomId))];
  const fromDate = parseDateOnly(from);
  const toDate = parseDateOnly(to);

  const [allocations, blocks, tasks] = await Promise.all([
    prisma.bedAllocation.findMany({
      where: {
        bedId: { in: bedIds },
        status: { in: ['HELD', 'ACTIVE'] },
        stayStart: { lt: toDate },
        stayEnd: { gt: fromDate },
      },
      select: { bedId: true, status: true, stayStart: true, stayEnd: true },
    }),
    prisma.inventoryBlock.findMany({
      where: {
        startAt: { lt: jakartaStartOfDay(to) },
        endAt: { gt: jakartaStartOfDay(from) },
        OR: [{ bedId: { in: bedIds } }, { roomId: { in: roomIds } }],
      },
      select: { bedId: true, roomId: true, blockType: true, startAt: true, endAt: true },
    }),
    prisma.housekeepingTask.findMany({
      where: {
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        OR: [{ bedId: { in: bedIds } }, { roomId: { in: roomIds } }],
      },
      select: { bedId: true, roomId: true },
    }),
  ]);

  const openTaskBeds = new Set<string>();
  const openTaskRooms = new Set<string>();
  for (const task of tasks) {
    if (task.bedId) openTaskBeds.add(task.bedId);
    else openTaskRooms.add(task.roomId);
  }

  const allocationsByBed = new Map<string, AllocationRow[]>();
  for (const allocation of allocations) {
    const list = allocationsByBed.get(allocation.bedId) ?? [];
    list.push(allocation);
    allocationsByBed.set(allocation.bedId, list);
  }
  const bedBlocksByBed = new Map<string, BlockRow[]>();
  const roomBlocksByRoom = new Map<string, BlockRow[]>();
  for (const block of blocks) {
    if (block.bedId) {
      const list = bedBlocksByBed.get(block.bedId) ?? [];
      list.push(block);
      bedBlocksByBed.set(block.bedId, list);
    } else if (block.roomId) {
      const list = roomBlocksByRoom.get(block.roomId) ?? [];
      list.push(block);
      roomBlocksByRoom.set(block.roomId, list);
    }
  }

  for (const bed of beds) {
    map.set(bed.id, {
      allocations: allocationsByBed.get(bed.id) ?? [],
      bedBlocks: bedBlocksByBed.get(bed.id) ?? [],
      roomBlocks: roomBlocksByRoom.get(bed.roomId) ?? [],
      openTask: openTaskBeds.has(bed.id) || openTaskRooms.has(bed.roomId),
    });
  }
  return map;
}

function statusForDay(
  bed: DatasetBed,
  events: BedEvents | undefined,
  start: Date,
  end: Date,
  startInstant: Date,
  endInstant: Date,
): BedOccupancyStatus {
  if (!events) return 'AVAILABLE';
  const allocations = events.allocations.filter(
    (allocation) => allocation.stayStart < end && allocation.stayEnd > start,
  );
  const blockTypes = [...events.bedBlocks, ...events.roomBlocks]
    .filter((block) => block.startAt < endInstant && block.endAt > startInstant)
    .map((block) => block.blockType);
  const cleaning =
    events.openTask ||
    ['DIRTY', 'CLEANING', 'INSPECTION_REQUIRED'].includes(bed.bedHousekeeping) ||
    ['DIRTY', 'CLEANING', 'INSPECTION_REQUIRED'].includes(bed.roomHousekeeping);
  return classifyBedStatus({ allocations, blockTypes, cleaning });
}

interface DayCounts {
  occupied: number;
  reserved: number;
  available: number;
  cleaning: number;
  maintenance: number;
  blocked: number;
}

function emptyCounts(): DayCounts {
  return { occupied: 0, reserved: 0, available: 0, cleaning: 0, maintenance: 0, blocked: 0 };
}

function addStatus(counts: DayCounts, status: BedOccupancyStatus): void {
  switch (status) {
    case 'OCCUPIED':
      counts.occupied += 1;
      break;
    case 'RESERVED':
      counts.reserved += 1;
      break;
    case 'CLEANING':
      counts.cleaning += 1;
      break;
    case 'MAINTENANCE':
      counts.maintenance += 1;
      break;
    case 'BLOCKED':
      counts.blocked += 1;
      break;
    default:
      counts.available += 1;
  }
}

function baseQualityNotes(asOf: string, today: string): string[] {
  const notes = [
    'Status CLEANING memakai kondisi housekeeping saat ini, bukan snapshot historis.',
    'Proyeksi dan tren dihitung dari transaksi yang tercatat; tidak ada model statistik.',
  ];
  if (asOf < today) {
    notes.push('Tanggal historis dihitung dari alokasi dan blok inventaris yang tersimpan.');
  }
  return notes;
}

function outOfServiceTotal(value: OccupancyOutOfService): number {
  return value.maintenance + value.blocked + value.inactive;
}

export async function getOccupancySummary(
  access: AccessScope,
  filter: OccupancyFilter,
  dateInput?: string,
): Promise<OccupancySummary> {
  const asOf = dateInput ?? todayInJakarta();
  const dataset = await loadDataset(access, filter);
  const start = parseDateOnly(asOf);
  const end = toDayEnd(asOf);
  const startInstant = jakartaStartOfDay(asOf);
  const endInstant = jakartaStartOfDay(formatDateOnly(end));
  const events = await loadEvents(dataset.capacityBeds, asOf, formatDateOnly(end));

  const counts = emptyCounts();
  const byDormitory = new Map<string, DayCounts>();
  for (const dormitory of dataset.dormitories) byDormitory.set(dormitory.id, emptyCounts());

  for (const bed of dataset.capacityBeds) {
    const status = statusForDay(bed, events.get(bed.id), start, end, startInstant, endInstant);
    addStatus(counts, status);
    const row = byDormitory.get(bed.dormitoryId);
    if (row) addStatus(row, status);
  }

  const capacity = dataset.capacityBeds.length;
  const outOfService: OccupancyOutOfService = {
    maintenance: dataset.outOfService.maintenance,
    blocked: dataset.outOfService.blocked,
    inactive: dataset.outOfService.inactive,
  };
  const notes = baseQualityNotes(asOf, todayInJakarta());
  if (outOfServiceTotal(outOfService) > 0) {
    notes.push(
      `${outOfServiceTotal(outOfService)} tempat tidur di luar layanan (maintenance/blokir/nonaktif) tidak dihitung dalam kapasitas.`,
    );
  }
  if (dataset.outOfService.excluded > 0) {
    notes.push(
      `${dataset.outOfService.excluded} tempat tidur pada gedung nonaktif tidak dihitung.`,
    );
  }
  if (capacity === 0) {
    notes.push('Tidak ada kapasitas aktif pada scope/filter ini.');
  }

  const breakdown: Array<{ status: BedOccupancyStatus; beds: number }> = [
    { status: 'AVAILABLE', beds: counts.available },
    { status: 'RESERVED', beds: counts.reserved },
    { status: 'OCCUPIED', beds: counts.occupied },
    { status: 'CLEANING', beds: counts.cleaning },
    { status: 'MAINTENANCE', beds: counts.maintenance },
    { status: 'BLOCKED', beds: counts.blocked },
  ];
  const statusBreakdown: OccupancyStatusCount[] = breakdown.map((item) => ({
    ...item,
    pct: capacity > 0 ? Math.round((item.beds / capacity) * 1000) / 10 : 0,
  }));

  const dormitoryRows: OccupancyDormitoryRow[] = dataset.dormitories.map((dormitory) => {
    const row = byDormitory.get(dormitory.id) ?? emptyCounts();
    const dormCapacity =
      row.available + row.reserved + row.occupied + row.cleaning + row.maintenance + row.blocked;
    return {
      dormitoryId: dormitory.id,
      dormitoryCode: dormitory.code,
      dormitoryName: dormitory.name,
      capacity: dormCapacity,
      occupied: row.occupied,
      reserved: row.reserved,
      available: row.available,
      cleaning: row.cleaning,
      maintenance: row.maintenance,
      blocked: row.blocked,
      outOfService: dataset.outOfService.byDormitory.get(dormitory.id) ?? {
        maintenance: 0,
        blocked: 0,
        inactive: 0,
      },
      occupancyRate: occupancyRate(row.occupied, dormCapacity),
    };
  });

  return {
    asOf,
    scope: scopeInfo(access),
    totals: {
      capacity,
      occupied: counts.occupied,
      reserved: counts.reserved,
      available: counts.available,
      cleaning: counts.cleaning,
      maintenance: counts.maintenance,
      blocked: counts.blocked,
      outOfService,
      excluded: dataset.outOfService.excluded,
    },
    occupancyRate: occupancyRate(counts.occupied, capacity),
    statusBreakdown,
    dormitories: dormitoryRows,
    formulas: OCCUPANCY_FORMULAS,
    dataQuality: { notes } satisfies OccupancyDataQuality,
    generatedAt: new Date().toISOString(),
  };
}

export async function getOccupancyTrend(
  access: AccessScope,
  filter: OccupancyFilter,
  from: string,
  to: string,
): Promise<OccupancyTrendResult> {
  const dataset = await loadDataset(access, filter);
  const events = await loadEvents(dataset.capacityBeds, from, to);
  const capacity = dataset.capacityBeds.length;
  const rangeDays = Math.round(
    (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000,
  );

  const days: OccupancyTrendResult['days'] = [];
  for (let index = 0; index < rangeDays; index += 1) {
    const date = formatDateOnly(addDays(parseDateOnly(from), index));
    const start = parseDateOnly(date);
    const end = addDays(start, 1);
    const startInstant = jakartaStartOfDay(date);
    const endInstant = jakartaStartOfDay(formatDateOnly(end));
    const counts = emptyCounts();
    for (const bed of dataset.capacityBeds) {
      addStatus(counts, statusForDay(bed, events.get(bed.id), start, end, startInstant, endInstant));
    }
    days.push({
      date,
      capacity,
      ...counts,
      occupancyRate: occupancyRate(counts.occupied, capacity),
    });
  }

  const notes = baseQualityNotes(from, todayInJakarta());
  notes.push('Kapasitas memakai status kamar dan tempat tidur saat ini, bukan snapshot historis.');
  if (capacity === 0) notes.push('Tidak ada kapasitas aktif pada scope/filter ini.');

  return {
    from,
    to,
    scope: scopeInfo(access),
    days,
    dataQuality: { notes },
    generatedAt: new Date().toISOString(),
  };
}

function confidenceFor(days: number, basis: OccupancyForecastBasis): OccupancyConfidence {
  if (basis === 'ROSTER_INCLUDED') return days <= 14 ? 'MEDIUM' : days <= 45 ? 'MEDIUM' : 'LOW';
  if (days <= 14) return 'HIGH';
  if (days <= 45) return 'MEDIUM';
  return 'LOW';
}

export async function getOccupancyForecast(
  access: AccessScope,
  filter: OccupancyFilter,
  from: string,
  to: string,
): Promise<OccupancyForecastResult> {
  const dataset = await loadDataset(access, filter);
  const rangeDays = Math.round(
    (parseDateOnly(to).getTime() - parseDateOnly(from).getTime()) / 86_400_000,
  );
  const capacity = dataset.capacityBeds.length;
  const confirmedByDay: number[] = new Array(rangeDays).fill(0);
  const rosterByDay: number[] = new Array(rangeDays).fill(0);

  if (dataset.capacityBeds.length > 0) {
    const bedIds = dataset.capacityBeds.map((bed) => bed.id);
    const allocations = await prisma.bedAllocation.findMany({
      where: {
        bedId: { in: bedIds },
        status: { in: ['HELD', 'ACTIVE'] },
        stayStart: { lt: parseDateOnly(to) },
        stayEnd: { gt: parseDateOnly(from) },
      },
      select: { bedId: true, stayStart: true, stayEnd: true },
    });
    const bedIdSet = new Set(bedIds);
    for (let index = 0; index < rangeDays; index += 1) {
      const dayStart = addDays(parseDateOnly(from), index);
      const dayEnd = addDays(dayStart, 1);
      const occupied = new Set<string>();
      for (const allocation of allocations) {
        if (allocation.stayStart < dayEnd && allocation.stayEnd > dayStart) {
          if (bedIdSet.has(allocation.bedId)) occupied.add(allocation.bedId);
        }
      }
      confirmedByDay[index] = occupied.size;
    }
  }

  const roomLevelFilter = Boolean(filter.roomId || filter.floorId || filter.buildingId);
  const scopeSupportsRoster = access.global || access.dormitoryIds.length > 0;
  let rosterTotal = 0;
  if (dataset.dormitories.length > 0 && !roomLevelFilter && scopeSupportsRoster) {
    const recommendations = await prisma.accommodationRecommendation.findMany({
      where: {
        status: { in: ['RECOMMENDED', 'APPROVED'] },
        linkedReservationId: null,
        suggestedCheckIn: { lt: parseDateOnly(to) },
        suggestedCheckOut: { gt: parseDateOnly(from) },
        ...(filter.dormitoryId
          ? { suggestedDormitoryId: filter.dormitoryId }
          : access.global
            ? {}
            : { suggestedDormitoryId: { in: dataset.dormitories.map((item) => item.id) } }),
      },
      select: { suggestedCheckIn: true, suggestedCheckOut: true },
    });
    rosterTotal = recommendations.length;
    for (let index = 0; index < rangeDays; index += 1) {
      const dayStart = addDays(parseDateOnly(from), index);
      const dayEnd = addDays(dayStart, 1);
      rosterByDay[index] = recommendations.filter(
        (item) => item.suggestedCheckIn < dayEnd && item.suggestedCheckOut > dayStart,
      ).length;
    }
  }

  const basis: OccupancyForecastBasis = rosterTotal > 0 ? 'ROSTER_INCLUDED' : 'CONFIRMED_ONLY';
  const hasCapacity = capacity > 0;

  const days = Array.from({ length: rangeDays }, (_, index) => {
    const rosterSignal = rosterByDay[index] ?? 0;
    const confirmedOccupied = confirmedByDay[index] ?? 0;
    const projectedDemand = hasCapacity ? confirmedOccupied + rosterSignal : null;
    return {
      date: formatDateOnly(addDays(parseDateOnly(from), index)),
      capacity,
      confirmedOccupied,
      rosterSignal,
      projectedDemand,
      projectedOccupancyRate:
        hasCapacity && projectedDemand !== null ? occupancyRate(projectedDemand, capacity) : null,
      overCapacity: hasCapacity && confirmedOccupied + rosterSignal > capacity,
    };
  });

  const notes = ['Proyeksi memakai alokasi HELD/ACTIVE dan rekomendasi roster yang belum teralokasi.'];
  if (basis === 'CONFIRMED_ONLY') {
    notes.push('Tidak ada sinyal roster aktif pada horizon ini; basis hanya permintaan terkonfirmasi.');
  } else {
    notes.push(
      `${rosterTotal} rekomendasi roster menjadi sinyal permintaan, bukan reservasi terkonfirmasi.`,
    );
  }
  if (roomLevelFilter) {
    notes.push('Sinyal roster tidak diterapkan pada filter tingkat kamar/gedung.');
  }
  if (!scopeSupportsRoster) {
    notes.push('Scope tingkat gedung tidak memakai sinyal roster; proyeksi hanya permintaan terkonfirmasi.');
  }
  if (confirmedByDay.every((value) => value === 0) && rosterTotal === 0) {
    notes.push('Tidak ada permintaan terkonfirmasi pada horizon ini.');
  }
  if (!hasCapacity) {
    notes.push('Tidak ada kapasitas aktif pada scope/filter ini; proyeksi tidak dihitung.');
  }

  return {
    from,
    to,
    scope: scopeInfo(access),
    basis,
    status: hasCapacity ? 'OK' : 'INSUFFICIENT_DATA',
    confidence: confidenceFor(rangeDays, basis),
    days,
    dataQuality: { notes },
    generatedAt: new Date().toISOString(),
  };
}
