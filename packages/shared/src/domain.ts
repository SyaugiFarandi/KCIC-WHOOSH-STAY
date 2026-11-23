import { z } from 'zod';

export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

export const HOUSEKEEPING_TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'VERIFIED',
] as const;
export type HousekeepingTaskStatus = (typeof HOUSEKEEPING_TASK_STATUSES)[number];

export const MAINTENANCE_STATUSES = ['OPEN', 'IN_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type MaintenancePriority = (typeof MAINTENANCE_PRIORITIES)[number];

export const INVENTORY_BLOCK_TYPES = ['MAINTENANCE', 'OPERATIONAL', 'OTHER'] as const;

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'TELEGRAM'] as const;

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export const createLocationSchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9-]+$/i),
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(500).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export interface LocationSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string | null;
  status: string;
  dormitoryCount: number;
  createdAt: string;
  updatedAt: string;
}

export const createDormitorySchema = z.object({
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9-]+$/i),
  name: z.string().trim().min(3).max(150),
  description: z.string().trim().max(2000).optional(),
  address: z.string().trim().max(500).optional(),
  stationCode: z.string().trim().max(50).optional(),
  locationId: z.uuid().optional(),
  contactName: z.string().trim().max(150).optional(),
  contactPhone: z.string().trim().max(40).optional(),
});
export type CreateDormitoryInput = z.infer<typeof createDormitorySchema>;

export const updateDormitorySchema = createDormitorySchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  locationId: z.uuid().nullable().optional(),
});
export type UpdateDormitoryInput = z.infer<typeof updateDormitorySchema>;

export const createBuildingSchema = z.object({
  code: z.string().trim().min(1).max(40),
  name: z.string().trim().min(2).max(150),
});
export type CreateBuildingInput = z.infer<typeof createBuildingSchema>;

export const updateBuildingSchema = createBuildingSchema.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

export const createFloorSchema = z.object({
  floorNumber: z.coerce.number().int().min(-5).max(100),
  name: z.string().trim().min(1).max(100),
});
export type CreateFloorInput = z.infer<typeof createFloorSchema>;

export const createRoomSchema = z.object({
  roomNumber: z.string().trim().min(1).max(40),
  name: z.string().trim().max(100).optional(),
  roomTypeId: z.uuid().optional(),
  roomTypeCode: z.string().trim().max(40).optional(),
  genderPolicy: z.enum(['UNSPECIFIED', 'MALE', 'FEMALE']).default('UNSPECIFIED'),
  description: z.string().trim().max(1000).optional(),
  facilityIds: z.array(z.uuid()).max(20).optional(),
});
export type CreateRoomInput = z.infer<typeof createRoomSchema>;

export const updateRoomSchema = z.object({
  roomNumber: z.string().trim().min(1).max(40).optional(),
  name: z.string().trim().max(100).nullable().optional(),
  genderPolicy: z.enum(['UNSPECIFIED', 'MALE', 'FEMALE']).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  roomTypeId: z.uuid().optional(),
  operationalStatus: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'BLOCKED']).optional(),
  housekeepingStatus: z.enum(['READY', 'DIRTY', 'CLEANING', 'INSPECTION_REQUIRED']).optional(),
  statusReason: z.string().trim().max(500).nullable().optional(),
});
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;

export const createBedSchema = z.object({
  bedCode: z.string().trim().min(1).max(40),
  label: z.string().trim().max(80).optional(),
});
export type CreateBedInput = z.infer<typeof createBedSchema>;

export const updateBedSchema = z.object({
  bedCode: z.string().trim().min(1).max(40).optional(),
  label: z.string().trim().max(80).nullable().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'BLOCKED']).optional(),
  housekeepingStatus: z.enum(['READY', 'DIRTY', 'CLEANING', 'INSPECTION_REQUIRED']).optional(),
  statusReason: z.string().trim().max(500).nullable().optional(),
});
export type UpdateBedInput = z.infer<typeof updateBedSchema>;

export const createFacilitySchema = z.object({
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
});
export type CreateFacilityInput = z.infer<typeof createFacilitySchema>;

export const updateFacilitySchema = createFacilitySchema
  .partial()
  .extend({ status: z.enum(['ACTIVE', 'INACTIVE']).optional() });
export type UpdateFacilityInput = z.infer<typeof updateFacilitySchema>;

export const createRoomTypeSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Z0-9_-]+$/i),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional(),
  defaultCapacity: z.coerce.number().int().min(1).max(30).default(2),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
});
export type CreateRoomTypeInput = z.infer<typeof createRoomTypeSchema>;

export const updateRoomTypeSchema = createRoomTypeSchema.partial();
export type UpdateRoomTypeInput = z.infer<typeof updateRoomTypeSchema>;

export interface RoomTypeSummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  defaultCapacity: number;
  status: string;
  roomCount: number;
}

export interface FacilitySummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  roomCount: number;
}

export interface MasterDataOption {
  value: string;
  label: string;
  count: number;
}

export interface BedSummary {
  id: string;
  bedCode: string;
  label: string | null;
  status: string;
  housekeepingStatus: string;
}

export interface RoomSummary {
  id: string;
  roomNumber: string;
  name: string | null;
  floorNumber: number;
  buildingId: string;
  buildingName: string;
  roomTypeName: string;
  genderPolicy: string;
  operationalStatus: string;
  housekeepingStatus: string;
  beds: BedSummary[];
}

export interface DormitorySummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  address: string | null;
  stationCode: string | null;
  locationId?: string | null;
  locationName?: string | null;
  contactName: string | null;
  contactPhone: string | null;
  status: string;
  buildingCount: number;
  roomCount: number;
  bedCount: number;
  availableBedCount?: number;
}

export interface DormitoryDetail extends DormitorySummary {
  buildings: Array<{
    id: string;
    code: string;
    name: string;
    status: string;
    floors: Array<{
      id: string;
      floorNumber: number;
      name: string;
      rooms: RoomSummary[];
    }>;
  }>;
  facilities: Array<{ id: string; code: string; name: string }>;
}

// ---------------------------------------------------------------------------
// Accommodation photo gallery
// ---------------------------------------------------------------------------

export const ACCOMMODATION_PHOTO_CATEGORIES = [
  'BEDROOM',
  'BED',
  'BATHROOM',
  'WARDROBE',
  'DESK',
  'FACILITY',
] as const;

export type AccommodationPhotoCategory = (typeof ACCOMMODATION_PHOTO_CATEGORIES)[number];

export interface AccommodationPhoto {
  id: string;
  dormitoryId: string;
  roomId: string | null;
  roomNumber: string | null;
  roomTypeName: string | null;
  category: AccommodationPhotoCategory;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  width: number;
  height: number;
  sizeBytes: number;
  url: string;
  thumbnailUrl: string;
  createdAt: string;
}

export interface AccommodationGalleryRoomType {
  code: string;
  name: string;
  capacity: number;
  photos: AccommodationPhoto[];
}

export interface AccommodationGalleryDormitory {
  dormitoryId: string;
  code: string;
  name: string;
  description: string | null;
  address: string | null;
  stationCode: string | null;
  coverPhoto: AccommodationPhoto | null;
  photos: AccommodationPhoto[];
  roomTypes: AccommodationGalleryRoomType[];
  facilities: string[];
  bedCount: number;
  roomCount: number;
}

export interface AccommodationGallery {
  items: AccommodationGalleryDormitory[];
}

export const accommodationPhotoUploadMetaSchema = z.object({
  dormitoryId: z.uuid(),
  roomId: z.uuid().optional(),
  category: z.enum(ACCOMMODATION_PHOTO_CATEGORIES).default('BEDROOM'),
  caption: z.string().trim().max(200).optional(),
});

export const accommodationPhotoUpdateSchema = z
  .object({
    caption: z.string().trim().max(200).nullable().optional(),
    category: z.enum(ACCOMMODATION_PHOTO_CATEGORIES).optional(),
    isCover: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'No changes' });

export const accommodationPhotoReorderSchema = z.object({
  dormitoryId: z.uuid(),
  roomId: z.uuid().nullable().optional(),
  orderedIds: z.array(z.uuid()).min(1).max(100),
});

// ---------------------------------------------------------------------------
// Availability
// ---------------------------------------------------------------------------

export const availabilityQuerySchema = z
  .object({
    checkIn: dateOnlySchema,
    checkOut: dateOnlySchema,
    dormitoryId: z.uuid().optional(),
    bedId: z.uuid().optional(),
  })
  .refine((value) => value.checkOut > value.checkIn, {
    message: 'checkOut must be after checkIn',
    path: ['checkOut'],
  });
export type AvailabilityQuery = z.infer<typeof availabilityQuerySchema>;

export interface AvailableBed {
  id: string;
  bedCode: string;
  label: string | null;
  roomId: string;
  roomNumber: string;
  roomName: string | null;
  buildingName: string;
  floorNumber: number;
  roomTypeName: string;
  housekeepingStatus: string;
  facilities: string[];
}

export interface AvailabilityResult {
  checkIn: string;
  checkOut: string;
  dormitories: Array<{
    dormitoryId: string;
    dormitoryCode: string;
    dormitoryName: string;
    stationCode: string | null;
    availableBeds: number;
    totalBeds: number;
    beds: AvailableBed[];
  }>;
}

// ---------------------------------------------------------------------------
// Reservations
// ---------------------------------------------------------------------------

export const createReservationSchema = z
  .object({
    dormitoryId: z.uuid(),
    employeeId: z.uuid().optional(),
    employeeIds: z.array(z.uuid()).max(4).optional(),
    checkInDate: dateOnlySchema,
    checkOutDate: dateOnlySchema,
    occupantCount: z.coerce.number().int().min(1).max(4).default(1),
    purpose: z.string().trim().max(300).optional(),
    bedIds: z.array(z.uuid()).min(1).max(4).optional(),
    autoConfirm: z.boolean().optional(),
    idempotencyKey: z.string().trim().min(8).max(150).optional(),
    isEmergency: z.boolean().optional(),
    emergencyReason: z.string().trim().max(300).optional(),
    priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'EMERGENCY']).optional(),
  })
  .refine((value) => value.checkOutDate > value.checkInDate, {
    message: 'checkOutDate must be after checkInDate',
    path: ['checkOutDate'],
  })
  .refine(
    (value) => !value.employeeIds || value.employeeIds.length === value.occupantCount,
    { message: 'employeeIds must match occupantCount', path: ['employeeIds'] },
  );
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const rejectReservationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const cancelReservationSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const allocateReservationSchema = z.object({
  bedIds: z.array(z.uuid()).min(1).max(4),
});

export interface ReservationAllocationSummary {
  id: string;
  bedId: string;
  bedCode: string;
  roomNumber: string;
  buildingName: string;
  dormitoryName: string;
  stayStart: string;
  stayEnd: string;
  status: string;
}

export interface ReservationSummary {
  id: string;
  bookingCode: string;
  status: string;
  approvalStatus: string;
  source: string;
  primaryEmployeeId: string;
  employeeName: string;
  dormitoryId: string;
  dormitoryName: string;
  checkInDate: string;
  checkOutDate: string;
  occupantCount: number;
  purpose: string | null;
  createdAt: string;
  confirmedAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  allocationSummary: string | null;
  isEmergency: boolean;
  emergencyReason: string | null;
  priority: string;
}

export interface ReservationDetail extends ReservationSummary {
  cancellationReason: string | null;
  allocations: ReservationAllocationSummary[];
  events: Array<{
    id: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string | null;
    createdAt: string;
  }>;
  guests: Array<{ id: string; employeeId: string; employeeName: string; guestRole: string }>;
  checkins: Array<{ employeeId: string; employeeName: string; checkedInAt: string }>;
  checkouts: Array<{ employeeId: string; employeeName: string; checkedOutAt: string }>;
  canCheckIn: boolean;
  canCheckOut: boolean;
  canCancel: boolean;
}

// ---------------------------------------------------------------------------
// Stays and QR
// ---------------------------------------------------------------------------

export const issueQrSchema = z.object({});
export interface IssuedQrToken {
  token: string;
  expiresAt: string;
  reservationId: string;
  bookingCode: string;
}

export const validateQrSchema = z.object({
  token: z.string().trim().min(20).max(300),
});

export const checkInSchema = z
  .object({
    token: z.string().trim().min(20).max(300).optional(),
    reservationId: z.uuid().optional(),
    employeeId: z.uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((value) => value.token || value.reservationId, {
    message: 'token or reservationId is required',
    path: ['token'],
  });
export type CheckInInput = z.infer<typeof checkInSchema>;

export const checkOutSchema = z
  .object({
    reservationId: z.uuid(),
    employeeId: z.uuid().optional(),
    roomCondition: z.enum(['GOOD', 'NEEDS_ATTENTION', 'DAMAGED']).default('GOOD'),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();

export interface StayRecord {
  reservationId: string;
  bookingCode: string;
  employeeName: string;
  dormitoryName: string;
  roomBeds: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  checkedInAt: string | null;
}

// ---------------------------------------------------------------------------
// Housekeeping
// ---------------------------------------------------------------------------

export const createHousekeepingTaskSchema = z
  .object({
    roomId: z.uuid(),
    bedId: z.uuid().optional(),
    taskType: z.enum(['CLEANING', 'INSPECTION', 'TURNDOWN']).default('CLEANING'),
    scheduledAt: z.string().datetime().optional(),
    assignedTo: z.uuid().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .strict();
export type CreateHousekeepingTaskInput = z.infer<typeof createHousekeepingTaskSchema>;

export const housekeepingActionSchema = z.object({
  action: z.enum(['START', 'COMPLETE', 'VERIFY']),
  notes: z.string().trim().max(500).optional(),
  checklistItemIds: z.array(z.uuid()).max(40).optional(),
});

export const assignHousekeepingSchema = z.object({
  assignedTo: z.uuid().nullable(),
});

export interface HousekeepingTaskSummary {
  id: string;
  taskType: string;
  status: string;
  roomId: string;
  roomNumber: string;
  dormitoryName: string;
  bedId: string | null;
  bedCode: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  scheduledAt: string | null;
  completedAt: string | null;
  verifiedAt: string | null;
  notes: string | null;
  checklist: Array<{ id: string; itemLabel: string; isCompleted: boolean }>;
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export const createMaintenanceTicketSchema = z
  .object({
    roomId: z.uuid().optional(),
    bedId: z.uuid().optional(),
    category: z.enum(['PLUMBING', 'ELECTRICAL', 'FURNITURE', 'AC', 'CLEANLINESS', 'OTHER']),
    priority: z.enum(MAINTENANCE_PRIORITIES).default('MEDIUM'),
    description: z.string().trim().min(5).max(1000),
    blocksInventory: z.boolean().default(false),
    blockStartAt: z.string().datetime().optional(),
    blockEndAt: z.string().datetime().optional(),
  })
  .refine((value) => value.roomId || value.bedId, {
    message: 'roomId or bedId is required',
    path: ['roomId'],
  })
  .refine((value) => !value.blocksInventory || (value.blockStartAt && value.blockEndAt), {
    message: 'Block dates are required when inventory is blocked',
    path: ['blockStartAt'],
  });
export type CreateMaintenanceTicketInput = z.infer<typeof createMaintenanceTicketSchema>;

export const updateMaintenanceSchema = z.object({
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  priority: z.enum(MAINTENANCE_PRIORITIES).optional(),
  assignedTo: z.uuid().nullable().optional(),
  resolutionNotes: z.string().trim().max(1000).optional(),
});

export interface MaintenanceTicketSummary {
  id: string;
  ticketCode: string;
  category: string;
  priority: string;
  description: string;
  status: string;
  blocksInventory: boolean;
  roomId: string | null;
  roomNumber: string | null;
  bedId: string | null;
  bedCode: string | null;
  dormitoryName: string | null;
  reportedByName: string;
  assignedTo: string | null;
  assignedToName: string | null;
  reportedAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionNotes: string | null;
}

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface RosterAssignmentSummary {
  id: string;
  externalRosterId: string;
  employeeId: string;
  employeeName: string;
  dutyDate: string;
  dutyStart: string | null;
  dutyEnd: string | null;
  stationCode: string | null;
  rosterStatus: string;
  syncedAt: string;
}

export interface RosterSyncRunSummary {
  id: string;
  sourceSystem: string;
  startedAt: string;
  completedAt: string | null;
  status: string;
  fetchedCount: number;
  createdCount: number;
  updatedCount: number;
  unchangedCount: number;
  failedCount: number;
  errorSummary: string | null;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface NotificationSummary {
  id: string;
  eventCode: string;
  title: string;
  body: string;
  readAt: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

export const notificationDeliveryQuerySchema = z.object({
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  status: z.string().max(30).optional(),
});

// ---------------------------------------------------------------------------
// Settings and policies
// ---------------------------------------------------------------------------

export const SETTING_KEYS = [
  'reservation.defaultApprovalMode',
  'availability.readinessWindowHours',
  'notifications.emailEnabled',
  'notifications.telegramEnabled',
  'roster.autoConfirmEnabled',
] as const;

export const updateSettingsSchema = z.object({
  settings: z
    .array(
      z.object({
        key: z.enum(SETTING_KEYS),
        value: z.union([z.string().max(200), z.number(), z.boolean()]),
      }),
    )
    .min(1)
    .max(20),
});

export const upsertPolicySchema = z.object({
  code: z.string().trim().min(2).max(50),
  name: z.string().trim().min(2).max(150),
  priority: z.coerce.number().int().min(1).max(1000).default(100),
  isActive: z.boolean().default(true),
  approvalMode: z.enum(['NOT_REQUIRED', 'ADMIN_APPROVAL']).default('ADMIN_APPROVAL'),
  criteria: z.record(z.string(), z.unknown()).default({}),
  rules: z.record(z.string(), z.unknown()).default({}),
});

// ---------------------------------------------------------------------------
// Reports and operations dashboard
// ---------------------------------------------------------------------------

export const reportQuerySchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
  dormitoryId: z.uuid().optional(),
});

export const calendarQuerySchema = z.object({
  from: dateOnlySchema,
  to: dateOnlySchema,
  dormitoryId: z.uuid().optional(),
});
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

export interface CalendarReservationEvent {
  id: string;
  bookingCode: string;
  employeeName: string;
  dormitoryName: string;
  status: string;
  guestCount: number;
}

export interface CalendarDay {
  date: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
  arrivals: CalendarReservationEvent[];
  departures: CalendarReservationEvent[];
}

export interface OccupancyCalendarResult {
  from: string;
  to: string;
  dormitoryId: string | null;
  totalBeds: number;
  days: CalendarDay[];
}

export interface OperationsOverview {
  reservations: {
    total: number;
    pending: number;
    confirmed: number;
    checkedIn: number;
    cancelled: number;
  };
  occupancy: {
    totalBeds: number;
    occupiedBeds: number;
    availableBeds: number;
    occupancyRate: number;
  };
  housekeeping: { pending: number; inProgress: number; completed: number };
  maintenance: { open: number; inProgress: number; resolved: number };
  upcomingCheckIns: number;
  upcomingCheckOuts: number;
  trend: Array<{ date: string; arrivals: number; departures: number }>;
  generatedAt: string;
}

export interface HousekeepingSummary {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  generatedAt: string;
}

export interface MaintenanceSummary {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  generatedAt: string;
}

export interface ReservationsSummary {
  total: number;
  pendingApproval: number;
  byStatus: Record<string, number>;
  arrivingToday: number;
  departingToday: number;
  generatedAt: string;
}

export interface EmployeesSummary {
  total: number;
  byStatus: Record<string, number>;
  byLocation: Record<string, number>;
  bySource: Record<string, number>;
  departments: number;
  positions: number;
  lastSyncedAt: string | null;
  generatedAt: string;
}

export const SYNTHETIC_EMPLOYEE_SOURCE = 'SYNTHETIC';

export const ORG_REFERENCE_TYPES = ['DEPARTMENT', 'DIVISION', 'POSITION'] as const;
export type OrgReferenceType = (typeof ORG_REFERENCE_TYPES)[number];

export const ORG_REFERENCE_STATUSES = ['UNCONFIRMED', 'CONFIRMED'] as const;
export type OrgReferenceStatus = (typeof ORG_REFERENCE_STATUSES)[number];

export interface EmployeeFilterOptions {
  locations: Array<{ code: string; name: string }>;
  departments: Array<{ code: string; name: string; status: string }>;
  divisions: Array<{ code: string; name: string; status: string }>;
  positions: Array<{ code: string; name: string; status: string }>;
  sources: string[];
}

export const RESEARCH_CLASSIFICATIONS = [
  'VERIFIED_PUBLIC',
  'VERIFIED_OFFICIAL_KCIC',
  'RESEARCH_CANDIDATE',
  'UNVERIFIED',
] as const;
export type ResearchClassification = (typeof RESEARCH_CLASSIFICATIONS)[number];

export const RESEARCH_CLASSIFICATION_LABELS: Record<ResearchClassification, string> = {
  VERIFIED_PUBLIC: 'Penginapan publik terverifikasi',
  VERIFIED_OFFICIAL_KCIC: 'Akomodasi resmi KCIC terverifikasi',
  RESEARCH_CANDIDATE: 'Kandidat riset',
  UNVERIFIED: 'Belum terverifikasi',
};

export const RESEARCH_VERIFICATION_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;
export type ResearchVerificationStatus = (typeof RESEARCH_VERIFICATION_STATUSES)[number];

export const RESEARCH_VERIFICATION_LABELS: Record<ResearchVerificationStatus, string> = {
  PENDING: 'Menunggu tinjauan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export const RESEARCH_SOURCE_TYPES = [
  'OFFICIAL_PROPERTY',
  'MAP',
  'KCIC_OFFICIAL',
  'PUBLIC_ARTICLE',
  'OTHER',
] as const;
export type ResearchSourceType = (typeof RESEARCH_SOURCE_TYPES)[number];

export const RESEARCH_SOURCE_TYPE_LABELS: Record<ResearchSourceType, string> = {
  OFFICIAL_PROPERTY: 'Situs resmi properti',
  MAP: 'Peta / Google Maps',
  KCIC_OFFICIAL: 'Sumber resmi KCIC',
  PUBLIC_ARTICLE: 'Artikel publik tepercaya',
  OTHER: 'Sumber lain',
};

export const RESEARCH_PROPERTY_TYPES = [
  'HOTEL',
  'APARTMENT',
  'GUESTHOUSE',
  'HOMESTAY',
  'MESS',
  'OTHER',
] as const;
export type ResearchPropertyType = (typeof RESEARCH_PROPERTY_TYPES)[number];

export const RESEARCH_PROPERTY_TYPE_LABELS: Record<ResearchPropertyType, string> = {
  HOTEL: 'Hotel',
  APARTMENT: 'Apartemen',
  GUESTHOUSE: 'Guest house',
  HOMESTAY: 'Homestay',
  MESS: 'Mess / asrama',
  OTHER: 'Lainnya',
};

export interface ResearchSourceItem {
  id: string;
  url: string;
  title: string | null;
  sourceType: ResearchSourceType;
  checkedAt: string;
  photoUrl: string | null;
  photoRights: string | null;
  photoTakenAt: string | null;
  notes: string | null;
}

export interface ResearchEventItem {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface ResearchItem {
  id: string;
  locationCode: string;
  locationName: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  distanceKm: number | null;
  propertyType: ResearchPropertyType | null;
  classification: ResearchClassification;
  verificationStatus: ResearchVerificationStatus;
  facilities: string[];
  website: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  promotedDormitoryId: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  sources: ResearchSourceItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ResearchSummary {
  total: number;
  byClassification: Record<string, number>;
  byVerificationStatus: Record<string, number>;
  byLocation: Record<string, number>;
  promoted: number;
}

export const EMPLOYEE_IMPORT_COLUMNS = [
  'employeeCode',
  'fullName',
  'employmentStatus',
  'workEmail',
  'departmentCode',
  'departmentName',
  'positionCode',
  'positionName',
  'homeStationCode',
] as const;

export const EMPLOYEE_IMPORT_EMPLOYMENT_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'RESIGNED',
] as const;

export const EMPLOYEE_IMPORT_MAX_ROWS = 1000;

export const employeeImportRowSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(2, 'Kode karyawan minimal 2 karakter.')
    .max(50)
    .regex(/^[A-Za-z0-9-]+$/, 'Kode karyawan hanya boleh huruf, angka, dan tanda hubung.'),
  fullName: z.string().trim().min(2, 'Nama lengkap minimal 2 karakter.').max(150),
  employmentStatus: z.enum(EMPLOYEE_IMPORT_EMPLOYMENT_STATUSES, {
    message: `Status kepegawaian harus salah satu dari: ${EMPLOYEE_IMPORT_EMPLOYMENT_STATUSES.join(', ')}.`,
  }),
  workEmail: z.string().trim().email('Format email tidak valid.').max(255).optional(),
  departmentCode: z.string().trim().max(50).optional(),
  departmentName: z.string().trim().max(150).optional(),
  positionCode: z.string().trim().max(50).optional(),
  positionName: z.string().trim().max(150).optional(),
  homeStationCode: z.string().trim().max(50).optional(),
});

export type EmployeeImportRowInput = z.infer<typeof employeeImportRowSchema>;

export type EmployeeImportRowAction = 'INSERT' | 'UPDATE' | 'INVALID';
export type ImportRowAction = EmployeeImportRowAction;

export interface ImportPreviewRow {
  rowNumber: number;
  data: Record<string, string | null>;
  errors: string[];
  action: EmployeeImportRowAction;
}

export interface ImportBatchSummary {
  id: string;
  entity?: string | null;
  fileName: string;
  status: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  insertedCount: number;
  updatedCount: number;
  errorSummary: string | null;
  uploadedBy: string | null;
  committedBy: string | null;
  createdAt: string;
  committedAt: string | null;
}

export interface ImportPreview {
  batch: ImportBatchSummary;
  rows: ImportPreviewRow[];
}

export interface ImportCommitResult {
  batch: ImportBatchSummary;
  inserted: number;
  updated: number;
  skipped: number;
  syncRunId?: string;
}

export type EmployeeImportPreviewRow = ImportPreviewRow;
export type EmployeeImportBatchSummary = ImportBatchSummary;
export type EmployeeImportPreview = ImportPreview;
export type EmployeeImportCommitResult = ImportCommitResult;

export const MASTER_IMPORT_ENTITIES = ['dormitories', 'buildings', 'rooms', 'beds'] as const;
export type MasterImportEntity = (typeof MASTER_IMPORT_ENTITIES)[number];

export const MASTER_IMPORT_COLUMNS: Record<MasterImportEntity, readonly string[]> = {
  dormitories: ['code', 'name', 'locationCode', 'description'],
  buildings: ['dormitoryCode', 'code', 'name'],
  rooms: [
    'dormitoryCode',
    'buildingCode',
    'floorNumber',
    'roomNumber',
    'roomTypeCode',
    'name',
    'genderPolicy',
  ],
  beds: ['dormitoryCode', 'buildingCode', 'floorNumber', 'roomNumber', 'bedCode', 'label'],
};

export const MASTER_IMPORT_MAX_ROWS = 1000;

export const masterDormitoryImportRowSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2, 'Kode dormitory minimal 2 karakter.')
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Kode hanya boleh huruf, angka, dan tanda hubung.'),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(150),
  locationCode: z.string().trim().max(40).optional(),
  description: z.string().trim().max(2000).optional(),
});

export const masterBuildingImportRowSchema = z.object({
  dormitoryCode: z.string().trim().min(1, 'Kode dormitory wajib diisi.').max(40),
  code: z
    .string()
    .trim()
    .min(1, 'Kode gedung wajib diisi.')
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Kode hanya boleh huruf, angka, dan tanda hubung.'),
  name: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(150),
});

export const masterRoomImportRowSchema = z.object({
  dormitoryCode: z.string().trim().min(1, 'Kode dormitory wajib diisi.').max(40),
  buildingCode: z.string().trim().min(1, 'Kode gedung wajib diisi.').max(40),
  floorNumber: z.coerce.number().int('Nomor lantai harus bilangan bulat.').min(-5).max(100),
  roomNumber: z.string().trim().min(1, 'Nomor kamar wajib diisi.').max(40),
  roomTypeCode: z.string().trim().min(1, 'Kode tipe kamar wajib diisi.').max(40),
  name: z.string().trim().max(100).optional(),
  genderPolicy: z.enum(['UNSPECIFIED', 'MALE', 'FEMALE']).optional(),
});

export const masterBedImportRowSchema = z.object({
  dormitoryCode: z.string().trim().min(1, 'Kode dormitory wajib diisi.').max(40),
  buildingCode: z.string().trim().min(1, 'Kode gedung wajib diisi.').max(40),
  floorNumber: z.coerce.number().int('Nomor lantai harus bilangan bulat.').min(-5).max(100),
  roomNumber: z.string().trim().min(1, 'Nomor kamar wajib diisi.').max(40),
  bedCode: z
    .string()
    .trim()
    .min(1, 'Kode bed wajib diisi.')
    .max(40)
    .regex(/^[A-Za-z0-9-]+$/, 'Kode hanya boleh huruf, angka, dan tanda hubung.'),
  label: z.string().trim().max(80).optional(),
});

export interface ReportReservationRow {
  id: string;
  bookingCode: string;
  employeeName: string;
  dormitoryName: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  source: string;
  createdAt: string;
}

export interface OccupancyReportRow {
  dormitoryId: string;
  dormitoryName: string;
  totalBeds: number;
  occupiedBeds: number;
  availableBeds: number;
  occupancyRate: number;
}

export interface OperationalReportRow {
  category: string;
  label: string;
  value: number;
}
