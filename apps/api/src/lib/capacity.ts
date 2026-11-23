import type { Prisma } from '@prisma/client';
import type { AccessScope } from '../modules/auth/types.js';
import { readableRoomWhere } from './scope.js';

export interface CapacityFilter {
  dormitoryId?: string;
  buildingId?: string;
  floorId?: string;
  roomId?: string;
}

export function capacityBedWhere(
  access: AccessScope,
  filter: CapacityFilter = {},
): Prisma.BedWhereInput {
  return {
    status: 'ACTIVE',
    room: {
      operationalStatus: 'ACTIVE',
      ...(filter.roomId ? { id: filter.roomId } : {}),
      ...readableRoomWhere(access),
      floor: {
        ...(filter.floorId ? { id: filter.floorId } : {}),
        building: {
          status: 'ACTIVE',
          ...(filter.buildingId ? { id: filter.buildingId } : {}),
          dormitory: {
            status: 'ACTIVE',
            ...(filter.dormitoryId ? { id: filter.dormitoryId } : {}),
          },
        },
      },
    },
  };
}

export const CAPACITY_EXPRESSION =
  'BED ACTIVE dan ROOM ACTIVE dalam BUILDING ACTIVE dan DORMITORY ACTIVE';

export function capacityRate(part: number, capacity: number): number | null {
  if (capacity <= 0) return null;
  return Math.round((part / capacity) * 1000) / 10;
}
