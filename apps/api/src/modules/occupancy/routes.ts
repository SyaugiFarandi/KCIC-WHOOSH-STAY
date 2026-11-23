import { Router } from 'express';
import {
  occupancyForecastQuerySchema,
  occupancySummaryQuerySchema,
  occupancyTrendQuerySchema,
  type OccupancyForecastResult,
  type OccupancySummary,
  type OccupancyTrendResult,
} from '@whoosh/shared';
import { sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { ValidationError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { formatDateOnly, parseDateOnly } from '../../lib/dates.js';
import {
  getOccupancyForecast,
  getOccupancySummary,
  getOccupancyTrend,
  type OccupancyFilter,
} from './service.js';

export const occupancyRouter = Router();

function assertValidDate(value: string, field: string): void {
  const parsed = parseDateOnly(value);
  if (Number.isNaN(parsed.getTime()) || formatDateOnly(parsed) !== value) {
    throw new ValidationError([{ path: [field], message: 'Tanggal tidak valid.' }]);
  }
}

function toFilter(query: {
  dormitoryId?: string;
  buildingId?: string;
  floorId?: string;
  roomId?: string;
}): OccupancyFilter {
  return {
    ...(query.dormitoryId ? { dormitoryId: query.dormitoryId } : {}),
    ...(query.buildingId ? { buildingId: query.buildingId } : {}),
    ...(query.floorId ? { floorId: query.floorId } : {}),
    ...(query.roomId ? { roomId: query.roomId } : {}),
  };
}

occupancyRouter.get('/occupancy/summary', requirePermission('occupancy.read'), async (req, res) => {
  const query = validate(occupancySummaryQuerySchema, req.query);
  if (query.date) assertValidDate(query.date, 'date');
  const result = await getOccupancySummary(req.access!, toFilter(query), query.date);
  sendSuccess(res, result satisfies OccupancySummary);
});

occupancyRouter.get('/occupancy/trend', requirePermission('occupancy.read'), async (req, res) => {
  const query = validate(occupancyTrendQuerySchema, req.query);
  assertValidDate(query.from, 'from');
  assertValidDate(query.to, 'to');
  const result = await getOccupancyTrend(req.access!, toFilter(query), query.from, query.to);
  sendSuccess(res, result satisfies OccupancyTrendResult);
});

occupancyRouter.get('/occupancy/forecast', requirePermission('occupancy.read'), async (req, res) => {
  const query = validate(occupancyForecastQuerySchema, req.query);
  assertValidDate(query.from, 'from');
  assertValidDate(query.to, 'to');
  const result = await getOccupancyForecast(req.access!, toFilter(query), query.from, query.to);
  sendSuccess(res, result satisfies OccupancyForecastResult);
});
