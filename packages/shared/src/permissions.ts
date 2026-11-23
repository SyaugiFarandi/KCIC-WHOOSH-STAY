export const PERMISSIONS = {
  dashboardRead: 'dashboard.read',
  locationsRead: 'locations.read',
  locationsManage: 'locations.manage',
  dormitoriesRead: 'dormitories.read',
  dormitoriesCreate: 'dormitories.create',
  dormitoriesUpdate: 'dormitories.update',
  dormitoriesDeactivate: 'dormitories.deactivate',
  buildingsManage: 'buildings.manage',
  floorsManage: 'floors.manage',
  roomsRead: 'rooms.read',
  roomsCreate: 'rooms.create',
  roomsUpdate: 'rooms.update',
  roomsStatusManage: 'rooms.status.manage',
  bedsManage: 'beds.manage',
  facilitiesManage: 'facilities.manage',
  availabilityRead: 'availability.read',
  occupancyRead: 'occupancy.read',
  reservationsRead: 'reservations.read',
  reservationsCreate: 'reservations.create',
  reservationsUpdate: 'reservations.update',
  reservationsCreateForOthers: 'reservations.create_for_others',
  reservationsApprove: 'reservations.approve',
  reservationsReject: 'reservations.reject',
  reservationsCancel: 'reservations.cancel',
  reservationsNoShow: 'reservations.no_show',
  exceptionsRead: 'exceptions.read',
  exceptionsManage: 'exceptions.manage',
  allocationsRead: 'allocations.read',
  allocationsExecute: 'allocations.execute',
  allocationsOverride: 'allocations.override',
  allocationsReassign: 'allocations.reassign',
  staysRead: 'stays.read',
  staysCheckIn: 'stays.check_in',
  staysCheckOut: 'stays.check_out',
  housekeepingRead: 'housekeeping.read',
  housekeepingAssign: 'housekeeping.assign',
  housekeepingExecute: 'housekeeping.execute',
  housekeepingVerify: 'housekeeping.verify',
  maintenanceRead: 'maintenance.read',
  maintenanceCreate: 'maintenance.create',
  maintenanceAssign: 'maintenance.assign',
  maintenanceUpdate: 'maintenance.update',
  maintenanceBlockInventory: 'maintenance.block_inventory',
  maintenanceClose: 'maintenance.close',
  rosterRead: 'roster.read',
  rosterSync: 'roster.sync',
  rosterPreview: 'roster.preview',
  rosterConvert: 'roster.convert',
  rosterResolveException: 'roster.resolve_exception',
  reportsRead: 'reports.read',
  reportsExport: 'reports.export',
  employeesRead: 'employees.read',
  employeesImport: 'employees.import',
  usersRead: 'users.read',
  usersManage: 'users.manage',
  rolesManage: 'roles.manage',
  policiesRead: 'policies.read',
  policiesCreate: 'policies.create',
  policiesUpdate: 'policies.update',
  policiesActivate: 'policies.activate',
  policiesEvaluate: 'policies.evaluate',
  policiesManage: 'policies.manage',
  notificationsManage: 'notifications.manage',
  auditRead: 'audit.read',
  settingsManage: 'settings.manage',
  attachmentsUpload: 'attachments.upload',
  attachmentsRead: 'attachments.read',
  attachmentsDelete: 'attachments.delete',
  photosManage: 'photos.manage',
  researchRead: 'research.read',
  researchManage: 'research.manage',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_CODES = Object.values(PERMISSIONS) as PermissionCode[];

export const ROLES = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  DORMITORY_MANAGER: 'DORMITORY_MANAGER',
  DORMITORY_ADMIN: 'DORMITORY_ADMIN',
  FRONT_DESK: 'FRONT_DESK',
  HOUSEKEEPING: 'HOUSEKEEPING',
  MAINTENANCE: 'MAINTENANCE',
  CREW: 'CREW',
  AUDITOR: 'AUDITOR',
} as const;

export type RoleCode = (typeof ROLES)[keyof typeof ROLES];

export const ROLE_CODES = Object.values(ROLES) as RoleCode[];

export const ROLE_LABELS: Record<RoleCode, string> = {
  SYSTEM_ADMIN: 'Administrator Sistem',
  DORMITORY_MANAGER: 'Manajer Dormitory',
  DORMITORY_ADMIN: 'Admin Dormitory',
  FRONT_DESK: 'Front Desk',
  HOUSEKEEPING: 'Housekeeping',
  MAINTENANCE: 'Petugas Maintenance',
  CREW: 'Kru',
  AUDITOR: 'Auditor',
};

export const SCOPE_TYPES = [
  'GLOBAL',
  'DORMITORY',
  'BUILDING',
  'ASSIGNED_TASK',
  'SELF',
] as const;

export type ScopeType = (typeof SCOPE_TYPES)[number];

export const SCOPE_LABELS: Record<ScopeType, string> = {
  GLOBAL: 'Global',
  DORMITORY: 'Dormitory',
  BUILDING: 'Gedung',
  ASSIGNED_TASK: 'Tugas yang ditugaskan',
  SELF: 'Data sendiri',
};

export const USER_STATUSES = ['ACTIVE', 'SUSPENDED', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const RESERVATION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'REJECTED',
  'NO_SHOW',
  'EXCEPTION',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const ALLOCATION_STATUSES = ['HELD', 'ACTIVE', 'RELEASED', 'CANCELLED'] as const;
export type AllocationStatus = (typeof ALLOCATION_STATUSES)[number];

export const ROOM_OPERATIONAL_STATUSES = ['ACTIVE', 'INACTIVE', 'MAINTENANCE', 'BLOCKED'] as const;
export type RoomOperationalStatus = (typeof ROOM_OPERATIONAL_STATUSES)[number];

export const READINESS_STATUSES = ['READY', 'DIRTY', 'CLEANING', 'INSPECTION_REQUIRED'] as const;
export type ReadinessStatus = (typeof READINESS_STATUSES)[number];
