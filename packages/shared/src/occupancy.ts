import { z } from 'zod';
import { dateOnlySchema } from './domain.js';

export const BED_OCCUPANCY_STATUSES = [
  'AVAILABLE',
  'RESERVED',
  'OCCUPIED',
  'CLEANING',
  'MAINTENANCE',
  'BLOCKED',
] as const;
export type BedOccupancyStatus = (typeof BED_OCCUPANCY_STATUSES)[number];

export const OCCUPANCY_TREND_MAX_DAYS = 92;

const occupancyFilterFields = {
  dormitoryId: z.uuid().optional(),
  buildingId: z.uuid().optional(),
  floorId: z.uuid().optional(),
  roomId: z.uuid().optional(),
};

export const occupancySummaryQuerySchema = z.object({
  date: dateOnlySchema.optional(),
  ...occupancyFilterFields,
});
export type OccupancySummaryQuery = z.infer<typeof occupancySummaryQuerySchema>;

function rangeWithinMax(value: { from: string; to: string }): boolean {
  const days =
    (Date.parse(`${value.to}T00:00:00.000Z`) - Date.parse(`${value.from}T00:00:00.000Z`)) /
    86_400_000;
  return days >= 1 && days <= OCCUPANCY_TREND_MAX_DAYS;
}

export const occupancyTrendQuerySchema = z
  .object({
    from: dateOnlySchema,
    to: dateOnlySchema,
    ...occupancyFilterFields,
  })
  .refine((value) => value.to > value.from, {
    message: 'to must be after from',
    path: ['to'],
  })
  .refine(rangeWithinMax, {
    message: `Range must not exceed ${OCCUPANCY_TREND_MAX_DAYS} days`,
    path: ['to'],
  });
export type OccupancyTrendQuery = z.infer<typeof occupancyTrendQuerySchema>;

export const occupancyForecastQuerySchema = occupancyTrendQuerySchema;
export type OccupancyForecastQuery = z.infer<typeof occupancyForecastQuerySchema>;

export const OCCUPANCY_FORECAST_BASES = ['CONFIRMED_ONLY', 'ROSTER_INCLUDED'] as const;
export type OccupancyForecastBasis = (typeof OCCUPANCY_FORECAST_BASES)[number];

export const OCCUPANCY_CONFIDENCE_LEVELS = ['HIGH', 'MEDIUM', 'LOW'] as const;
export type OccupancyConfidence = (typeof OCCUPANCY_CONFIDENCE_LEVELS)[number];

export interface OccupancyScopeInfo {
  level: 'global' | 'dormitory' | 'building';
  dormitoryIds: string[];
  buildingIds: string[];
}

export interface OccupancyStatusCount {
  status: BedOccupancyStatus;
  beds: number;
  pct: number;
}

export interface OccupancyOutOfService {
  maintenance: number;
  blocked: number;
  inactive: number;
}

export interface OccupancyDormitoryRow {
  dormitoryId: string;
  dormitoryCode: string;
  dormitoryName: string;
  capacity: number;
  occupied: number;
  reserved: number;
  available: number;
  cleaning: number;
  maintenance: number;
  blocked: number;
  outOfService: OccupancyOutOfService;
  occupancyRate: number | null;
}

export interface OccupancyFormula {
  key: string;
  label: string;
  expression: string;
}

export interface OccupancyDataQuality {
  notes: string[];
}

export interface OccupancySummary {
  asOf: string;
  scope: OccupancyScopeInfo;
  totals: {
    capacity: number;
    occupied: number;
    reserved: number;
    available: number;
    cleaning: number;
    maintenance: number;
    blocked: number;
    outOfService: OccupancyOutOfService;
    excluded: number;
  };
  occupancyRate: number | null;
  statusBreakdown: OccupancyStatusCount[];
  dormitories: OccupancyDormitoryRow[];
  formulas: OccupancyFormula[];
  dataQuality: OccupancyDataQuality;
  generatedAt: string;
}

export interface OccupancyTrendDay {
  date: string;
  capacity: number;
  occupied: number;
  reserved: number;
  available: number;
  cleaning: number;
  maintenance: number;
  blocked: number;
  occupancyRate: number | null;
}

export interface OccupancyTrendResult {
  from: string;
  to: string;
  scope: OccupancyScopeInfo;
  days: OccupancyTrendDay[];
  dataQuality: OccupancyDataQuality;
  generatedAt: string;
}

export interface OccupancyForecastDay {
  date: string;
  capacity: number;
  confirmedOccupied: number;
  rosterSignal: number;
  projectedDemand: number | null;
  projectedOccupancyRate: number | null;
  overCapacity: boolean;
}

export interface OccupancyForecastResult {
  from: string;
  to: string;
  scope: OccupancyScopeInfo;
  basis: OccupancyForecastBasis;
  status: 'OK' | 'INSUFFICIENT_DATA';
  confidence: OccupancyConfidence;
  days: OccupancyForecastDay[];
  dataQuality: OccupancyDataQuality;
  generatedAt: string;
}

export const OCCUPANCY_STATUS_LABELS: Record<BedOccupancyStatus, string> = {
  AVAILABLE: 'Tersedia',
  RESERVED: 'Direservasi',
  OCCUPIED: 'Terisi',
  CLEANING: 'Dibersihkan',
  MAINTENANCE: 'Pemeliharaan',
  BLOCKED: 'Diblokir',
};

export const OCCUPANCY_FORMULAS: OccupancyFormula[] = [
  {
    key: 'capacity',
    label: 'Kapasitas',
    expression: 'BED ACTIVE dan ROOM ACTIVE dalam BUILDING ACTIVE dan DORMITORY ACTIVE',
  },
  {
    key: 'occupancyRate',
    label: 'Tingkat hunian',
    expression: 'occupied / capacity x 100 (null bila capacity = 0)',
  },
  {
    key: 'available',
    label: 'Tersedia',
    expression: 'capacity - occupied - reserved - cleaning - maintenance - blocked',
  },
  {
    key: 'statusPrecedence',
    label: 'Urutan status',
    expression: 'BLOCKED > MAINTENANCE > OCCUPIED > RESERVED > CLEANING > AVAILABLE',
  },
];
