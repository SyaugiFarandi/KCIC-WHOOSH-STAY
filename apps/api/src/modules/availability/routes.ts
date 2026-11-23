import { Router } from 'express';
import { availabilityQuerySchema } from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { requirePermission } from '../auth/middleware.js';
import { readableDormitoryWhere } from '../../lib/scope.js';
import { findAvailableBeds, groupAvailability } from './service.js';

export const availabilityRouter = Router();

availabilityRouter.get('/availability', requirePermission('availability.read'), async (req, res) => {
  const query = validate(availabilityQuerySchema, req.query);
  const access = req.access!;
  const beds = await findAvailableBeds(
    prisma,
    {
      checkIn: query.checkIn,
      checkOut: query.checkOut,
      ...(query.dormitoryId ? { dormitoryId: query.dormitoryId } : {}),
      ...(query.bedId ? { bedIds: [query.bedId] } : {}),
    },
    access,
  );

  const buildingOnly = access.buildingIds.length > 0 && access.dormitoryIds.length === 0;
  const dormitories = await prisma.dormitory.findMany({
    where: {
      status: 'ACTIVE',
      ...readableDormitoryWhere(access),
      ...(query.dormitoryId ? { id: query.dormitoryId } : {}),
    },
    include: {
      buildings: {
        where: buildingOnly ? { id: { in: access.buildingIds } } : { status: 'ACTIVE' },
        include: {
          floors: {
            include: {
              rooms: {
                where: { operationalStatus: 'ACTIVE' },
                include: { beds: { where: { status: 'ACTIVE' } } },
              },
            },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const summaries = dormitories.map((dormitory) => ({
    id: dormitory.id,
    code: dormitory.code,
    name: dormitory.name,
    stationCode: dormitory.stationCode,
    totalBeds: dormitory.buildings.reduce(
      (buildingSum, building) =>
        buildingSum +
        building.floors.reduce(
          (floorSum, floor) =>
            floorSum + floor.rooms.reduce((roomSum, room) => roomSum + room.beds.length, 0),
          0,
        ),
      0,
    ),
  }));

  sendSuccess(res, groupAvailability(query.checkIn, query.checkOut, beds, summaries));
});
