import { Prisma } from '@prisma/client';
import type { AccessScope } from '../modules/auth/types.js';
import { ForbiddenError } from '../middleware/errors.js';

export function readableDormitoryWhere(access: AccessScope): Prisma.DormitoryWhereInput {
  if (access.global || access.selfOnly) return {};
  const clauses: Prisma.DormitoryWhereInput[] = [];
  if (access.dormitoryIds.length) clauses.push({ id: { in: access.dormitoryIds } });
  if (access.buildingIds.length) {
    clauses.push({ buildings: { some: { id: { in: access.buildingIds } } } });
  }
  if (!clauses.length) throw new ForbiddenError('No accommodation scope is available');
  return { OR: clauses };
}

export function readableRoomWhere(access: AccessScope): Prisma.RoomWhereInput {
  if (access.global || access.selfOnly) return {};
  const clauses: Prisma.RoomWhereInput[] = [];
  if (access.dormitoryIds.length) {
    clauses.push({ floor: { building: { dormitoryId: { in: access.dormitoryIds } } } });
  }
  if (access.buildingIds.length) {
    clauses.push({ floor: { buildingId: { in: access.buildingIds } } });
  }
  if (!clauses.length) throw new ForbiddenError('No accommodation scope is available');
  return { OR: clauses };
}

export function readableReservationWhere(access: AccessScope): Prisma.ReservationWhereInput {
  if (access.global || access.selfOnly) return {};
  const clauses: Prisma.ReservationWhereInput[] = [];
  if (access.dormitoryIds.length) clauses.push({ dormitoryId: { in: access.dormitoryIds } });
  if (access.buildingIds.length) {
    // Building-scoped principals see reservations allocated to their buildings, plus
    // unallocated reservations in dormitories that contain a scoped building (so they
    // can still perform allocation). Allocations in other buildings stay invisible.
    clauses.push({
      OR: [
        {
          allocations: {
            some: { bed: { room: { floor: { buildingId: { in: access.buildingIds } } } } },
          },
        },
        {
          allocations: { none: {} },
          dormitory: { buildings: { some: { id: { in: access.buildingIds } } } },
        },
      ],
    });
  }
  if (!clauses.length) throw new ForbiddenError('No accommodation scope is available');
  return { OR: clauses };
}

export function readableAllocationWhere(access: AccessScope): Prisma.BedAllocationWhereInput {
  if (access.global) return {};
  const clauses: Prisma.BedAllocationWhereInput[] = [];
  if (access.dormitoryIds.length) {
    clauses.push({
      bed: { room: { floor: { building: { dormitoryId: { in: access.dormitoryIds } } } } },
    });
  }
  if (access.buildingIds.length) {
    clauses.push({ bed: { room: { floor: { buildingId: { in: access.buildingIds } } } } });
  }
  if (!clauses.length) throw new ForbiddenError('No accommodation scope is available');
  return { OR: clauses };
}

export interface RoomScopeTarget {
  id: string;
  floorId: string;
  floor: { buildingId: string; building: { dormitoryId: string } };
}

export function canManageDormitory(
  access: Pick<AccessScope, 'global' | 'dormitoryIds' | 'buildingIds'>,
  dormitoryId: string,
  buildingId?: string,
): boolean {
  if (access.global) return true;
  if (access.dormitoryIds.includes(dormitoryId)) return true;
  if (buildingId && access.buildingIds.includes(buildingId)) return true;
  return false;
}

export function assertManageDormitory(
  access: AccessScope,
  dormitoryId: string,
  buildingId?: string,
): void {
  if (!canManageDormitory(access, dormitoryId, buildingId)) {
    throw new ForbiddenError('You do not manage this accommodation unit');
  }
}

export function assertRoomScope(access: AccessScope, room: RoomScopeTarget): void {
  assertManageDormitory(access, room.floor.building.dormitoryId, room.floor.buildingId);
}
