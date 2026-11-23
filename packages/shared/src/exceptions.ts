import { z } from 'zod';
import { createPaginationQuerySchema, type PaginationMeta } from './schemas.js';

export const RESERVATION_EXCEPTION_TYPES = [
  'ALLOCATION_CONFLICT',
  'OVERBOOKING',
  'READINESS_FAILURE',
  'ALLOCATION_MISSING',
  'POLICY_VIOLATION',
] as const;

export type ReservationExceptionType = (typeof RESERVATION_EXCEPTION_TYPES)[number];

export const RESERVATION_EXCEPTION_TYPE_LABELS: Record<ReservationExceptionType, string> = {
  ALLOCATION_CONFLICT: 'Konflik alokasi tempat tidur',
  OVERBOOKING: 'Overbooking',
  READINESS_FAILURE: 'Kesiapan kamar gagal',
  ALLOCATION_MISSING: 'Alokasi belum dibuat',
  POLICY_VIOLATION: 'Pelanggaran kebijakan',
};

export const RESERVATION_EXCEPTION_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

export type ReservationExceptionSeverity = (typeof RESERVATION_EXCEPTION_SEVERITIES)[number];

export const RESERVATION_EXCEPTION_SEVERITY_LABELS: Record<ReservationExceptionSeverity, string> = {
  CRITICAL: 'Kritis',
  HIGH: 'Tinggi',
  MEDIUM: 'Sedang',
  LOW: 'Rendah',
};

export const RESERVATION_EXCEPTION_STATUSES = [
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DISMISSED',
] as const;

export type ReservationExceptionStatus = (typeof RESERVATION_EXCEPTION_STATUSES)[number];

export const RESERVATION_EXCEPTION_STATUS_LABELS: Record<ReservationExceptionStatus, string> = {
  OPEN: 'Terbuka',
  ACKNOWLEDGED: 'Ditangani',
  RESOLVED: 'Selesai',
  DISMISSED: 'Diabaikan',
};

export const RESERVATION_EXCEPTION_OPEN_STATUSES: ReservationExceptionStatus[] = [
  'OPEN',
  'ACKNOWLEDGED',
];

export interface ReservationExceptionActor {
  id: string;
  displayName: string;
}

export interface ReservationExceptionDetail {
  id: string;
  type: ReservationExceptionType;
  severity: ReservationExceptionSeverity;
  status: ReservationExceptionStatus;
  dormitoryId: string;
  dormitoryCode: string;
  dormitoryName: string;
  reservationId: string | null;
  bookingCode: string | null;
  reservationStatus: string | null;
  roomId: string | null;
  roomLabel: string | null;
  bedId: string | null;
  bedLabel: string | null;
  title: string;
  description: string;
  evidence: Record<string, unknown> | null;
  occurrenceCount: number;
  assignedTo: ReservationExceptionActor | null;
  detectedAt: string;
  lastDetectedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  resolvedBy: ReservationExceptionActor | null;
}

export interface ReservationExceptionCounts {
  open: number;
  acknowledged: number;
  resolved: number;
  dismissed: number;
  criticalOpen: number;
}

export interface ReservationExceptionListResult {
  items: ReservationExceptionDetail[];
  counts: ReservationExceptionCounts;
  pagination: PaginationMeta;
}

export const reservationExceptionListQuerySchema = createPaginationQuerySchema({
  pageSize: 20,
  maxPageSize: 100,
}).extend({
  status: z.enum(RESERVATION_EXCEPTION_STATUSES).optional(),
  severity: z.enum(RESERVATION_EXCEPTION_SEVERITIES).optional(),
  type: z.enum(RESERVATION_EXCEPTION_TYPES).optional(),
  dormitoryId: z.uuid().optional(),
  assignedToMe: z.enum(['true', 'false']).optional(),
  openOnly: z.enum(['true', 'false']).optional(),
});

export type ReservationExceptionListQuery = z.infer<typeof reservationExceptionListQuerySchema>;

export const reservationExceptionAssignSchema = z
  .object({
    assignedToUserId: z.uuid().nullable().optional(),
    assignToSelf: z.literal(true).optional(),
  })
  .refine(
    (value) => (value.assignToSelf === true) !== (value.assignedToUserId !== undefined),
    { message: 'Pilih satu: tugaskan ke diri sendiri atau ke pengguna lain.' },
  );

export type ReservationExceptionAssignInput = z.infer<typeof reservationExceptionAssignSchema>;

export const reservationExceptionResolveSchema = z.object({
  status: z.enum(['RESOLVED', 'DISMISSED']),
  resolutionNote: z.string().trim().min(3).max(1000),
});

export type ReservationExceptionResolveInput = z.infer<
  typeof reservationExceptionResolveSchema
>;
