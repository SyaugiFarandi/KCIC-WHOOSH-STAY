import type { Prisma, PrismaClient } from '@prisma/client';
import type { AccessScope } from '../auth/types.js';
import { prisma } from '../../lib/prisma.js';
import { formatDateOnly, jakartaStartOfDay, parseDateOnly, todayInJakarta } from '../../lib/dates.js';
import { readableDormitoryWhere } from '../../lib/scope.js';

type Client = PrismaClient | Prisma.TransactionClient;

export interface AvailabilitySearch {
  checkIn: string;
  checkOut: string;
  dormitoryId?: string;
  bedIds?: string[];
}

export interface AvailableBedRecord {
  id: string;
  bedCode: string;
  label: string | null;
  roomId: string;
  roomNumber: string;
  roomName: string | null;
  roomTypeName: string;
  floorNumber: number;
  buildingName: string;
  housekeepingStatus: string;
  roomHousekeepingStatus: string;
  operationalStatus: string;
  dormitoryId: string;
  dormitoryCode: string;
  dormitoryName: string;
  stationCode: string | null;
  facilities: string[];
}

export async function readinessWindowHours(client: Client = prisma): Promise<number> {
  const setting = await client.systemSetting.findUnique({
    where: { key: 'availability.readinessWindowHours' },
  });
  if (!setting) return 0;
  const value = setting.value as unknown;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.min(numeric, 720) : 0;
}

export function requiresReadiness(
  checkIn: string,
  windowHours: number,
  today = todayInJakarta(),
): boolean {
  if (checkIn <= today) return true;
  if (windowHours <= 0) return false;
  const diffHours =
    (parseDateOnly(checkIn).getTime() - parseDateOnly(today).getTime()) / 3_600_000;
  return diffHours <= windowHours;
}

export async function findAvailableBeds(
  client: Client,
  search: AvailabilitySearch,
  access: AccessScope,
): Promise<AvailableBedRecord[]> {
  const dormitoryScope = readableDormitoryWhere(access);
  const windowHours = await readinessWindowHours(client);
  const enforceReady = requiresReadiness(search.checkIn, windowHours);
  const startInstant = jakartaStartOfDay(search.checkIn);
  const endInstant = jakartaStartOfDay(search.checkOut);
  const checkInDate = parseDateOnly(search.checkIn);
  const checkOutDate = parseDateOnly(search.checkOut);

  const beds = await client.bed.findMany({
    where: {
      status: 'ACTIVE',
      ...(search.bedIds?.length ? { id: { in: search.bedIds } } : {}),
      allocations: {
        none: {
          status: { in: ['HELD', 'ACTIVE'] },
          stayStart: { lt: checkOutDate },
          stayEnd: { gt: checkInDate },
        },
      },
      inventoryBlocks: {
        none: { startAt: { lt: endInstant }, endAt: { gt: startInstant } },
      },
      room: {
        operationalStatus: 'ACTIVE',
        ...(enforceReady ? { housekeepingStatus: 'READY' } : {}),
        inventoryBlocks: {
          none: { startAt: { lt: endInstant }, endAt: { gt: startInstant } },
        },
        floor: {
          building: {
            status: 'ACTIVE',
            dormitory: {
              status: 'ACTIVE',
              ...dormitoryScope,
              ...(search.dormitoryId ? { id: search.dormitoryId } : {}),
            },
          },
        },
      },
      ...(enforceReady ? { housekeepingStatus: 'READY' } : {}),
    },
    include: {
      room: {
        include: {
          roomType: true,
          roomFacilities: { include: { facility: true } },
          floor: {
            include: {
              building: { include: { dormitory: true } },
            },
          },
        },
      },
    },
    orderBy: [{ roomId: 'asc' }, { bedCode: 'asc' }],
  });

  return beds.map((bed) => {
    const building = bed.room.floor.building;
    const dormitory = building.dormitory;
    return {
      id: bed.id,
      bedCode: bed.bedCode,
      label: bed.label,
      roomId: bed.roomId,
      roomNumber: bed.room.roomNumber,
      roomName: bed.room.name,
      roomTypeName: bed.room.roomType.name,
      floorNumber: bed.room.floor.floorNumber,
      buildingName: building.name,
      housekeepingStatus: bed.housekeepingStatus,
      roomHousekeepingStatus: bed.room.housekeepingStatus,
      operationalStatus: bed.room.operationalStatus,
      dormitoryId: dormitory.id,
      dormitoryCode: dormitory.code,
      dormitoryName: dormitory.name,
      stationCode: dormitory.stationCode,
      facilities: bed.room.roomFacilities.map((item) => item.facility.name),
    };
  });
}

export function groupAvailability(
  checkIn: string,
  checkOut: string,
  beds: AvailableBedRecord[],
  dormitories: Array<{ id: string; code: string; name: string; stationCode: string | null; totalBeds: number }>,
) {
  return {
    checkIn,
    checkOut,
    dormitories: dormitories.map((dormitory) => {
      const available = beds.filter((bed) => bed.dormitoryId === dormitory.id);
      return {
        dormitoryId: dormitory.id,
        dormitoryCode: dormitory.code,
        dormitoryName: dormitory.name,
        stationCode: dormitory.stationCode,
        availableBeds: available.length,
        totalBeds: dormitory.totalBeds,
        beds: available.map((bed) => ({
          id: bed.id,
          bedCode: bed.bedCode,
          label: bed.label,
          roomId: bed.roomId,
          roomNumber: bed.roomNumber,
          roomName: bed.roomName,
          buildingName: bed.buildingName,
          floorNumber: bed.floorNumber,
          roomTypeName: bed.roomTypeName,
          housekeepingStatus: bed.housekeepingStatus,
          facilities: bed.facilities,
        })),
      };
    }),
  };
}

export function toDateLabel(value: Date): string {
  return formatDateOnly(value);
}
