import type { PrismaClient } from '@prisma/client';
import {
  PERMISSION_CODES,
  PERMISSIONS,
  ROLES,
  ROLE_CODES,
  ROLE_LABELS,
  type PermissionCode,
  type RoleCode,
} from '@whoosh/shared';
import { DEMO_PASSWORD_DEFAULT, hashDemoPassword } from '../lib/demo-password.js';

type SeedClient = PrismaClient;

const DEMO_PASSWORD = process.env.DEMO_PASSWORD?.trim() || DEMO_PASSWORD_DEFAULT;
let demoPasswordHash: string | undefined;

export interface SeedSummary {
  permissions: number;
  roles: number;
  rolePermissions: number;
  users: number;
  employees: number;
  dormitories: number;
  rooms: number;
  beds: number;
  reservations: number;
  housekeepingTasks: number;
  maintenanceTickets: number;
  rosterAssignments: number;
}

const ALL_PERMISSIONS = new Set<PermissionCode>(PERMISSION_CODES);

function pick(...codes: PermissionCode[]): PermissionCode[] {
  for (const code of codes) {
    if (!ALL_PERMISSIONS.has(code)) {
      throw new Error(`Unknown permission code in seed role bundle: ${code}`);
    }
  }
  return codes;
}

function allExcept(...excluded: PermissionCode[]): PermissionCode[] {
  const excludedSet = new Set(excluded);
  return PERMISSION_CODES.filter((code) => !excludedSet.has(code));
}

export const ROLE_PERMISSIONS: Record<RoleCode, PermissionCode[]> = {
  SYSTEM_ADMIN: allExcept(),
  DORMITORY_MANAGER: pick(
    PERMISSIONS.dashboardRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.dormitoriesRead,
    PERMISSIONS.roomsRead,
    PERMISSIONS.availabilityRead,
    PERMISSIONS.reservationsRead,
    PERMISSIONS.reservationsCreate,
    PERMISSIONS.reservationsCreateForOthers,
    PERMISSIONS.reservationsUpdate,
    PERMISSIONS.reservationsApprove,
    PERMISSIONS.reservationsReject,
    PERMISSIONS.reservationsCancel,
    PERMISSIONS.reservationsNoShow,
    PERMISSIONS.allocationsRead,
    PERMISSIONS.allocationsExecute,
    PERMISSIONS.allocationsOverride,
    PERMISSIONS.allocationsReassign,
    PERMISSIONS.staysRead,
    PERMISSIONS.housekeepingRead,
    PERMISSIONS.housekeepingVerify,
    PERMISSIONS.maintenanceRead,
    PERMISSIONS.rosterRead,
    PERMISSIONS.rosterPreview,
    PERMISSIONS.rosterResolveException,
    PERMISSIONS.reportsRead,
    PERMISSIONS.reportsExport,
    PERMISSIONS.employeesRead,
    PERMISSIONS.usersRead,
    PERMISSIONS.auditRead,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsRead,
    PERMISSIONS.attachmentsDelete,
    PERMISSIONS.photosManage,
    PERMISSIONS.researchRead,
  ),
  DORMITORY_ADMIN: pick(
    PERMISSIONS.dashboardRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.locationsManage,
    PERMISSIONS.dormitoriesRead,
    PERMISSIONS.dormitoriesCreate,
    PERMISSIONS.dormitoriesUpdate,
    PERMISSIONS.dormitoriesDeactivate,
    PERMISSIONS.buildingsManage,
    PERMISSIONS.floorsManage,
    PERMISSIONS.roomsRead,
    PERMISSIONS.roomsCreate,
    PERMISSIONS.roomsUpdate,
    PERMISSIONS.roomsStatusManage,
    PERMISSIONS.bedsManage,
    PERMISSIONS.facilitiesManage,
    PERMISSIONS.availabilityRead,
    PERMISSIONS.reservationsRead,
    PERMISSIONS.reservationsCreate,
    PERMISSIONS.reservationsCreateForOthers,
    PERMISSIONS.reservationsUpdate,
    PERMISSIONS.reservationsApprove,
    PERMISSIONS.reservationsReject,
    PERMISSIONS.reservationsCancel,
    PERMISSIONS.reservationsNoShow,
    PERMISSIONS.allocationsRead,
    PERMISSIONS.allocationsExecute,
    PERMISSIONS.allocationsOverride,
    PERMISSIONS.allocationsReassign,
    PERMISSIONS.staysRead,
    PERMISSIONS.staysCheckIn,
    PERMISSIONS.staysCheckOut,
    PERMISSIONS.housekeepingRead,
    PERMISSIONS.housekeepingAssign,
    PERMISSIONS.housekeepingVerify,
    PERMISSIONS.maintenanceRead,
    PERMISSIONS.maintenanceAssign,
    PERMISSIONS.rosterRead,
    PERMISSIONS.rosterPreview,
    PERMISSIONS.reportsRead,
    PERMISSIONS.reportsExport,
    PERMISSIONS.employeesRead,
    PERMISSIONS.employeesImport,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsRead,
    PERMISSIONS.attachmentsDelete,
    PERMISSIONS.photosManage,
    PERMISSIONS.researchRead,
  ),
  FRONT_DESK: pick(
    PERMISSIONS.dashboardRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.dormitoriesRead,
    PERMISSIONS.roomsRead,
    PERMISSIONS.availabilityRead,
    PERMISSIONS.reservationsRead,
    PERMISSIONS.allocationsRead,
    PERMISSIONS.staysRead,
    PERMISSIONS.staysCheckIn,
    PERMISSIONS.staysCheckOut,
    PERMISSIONS.housekeepingRead,
    PERMISSIONS.maintenanceRead,
    PERMISSIONS.maintenanceCreate,
    PERMISSIONS.reportsRead,
    PERMISSIONS.employeesRead,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsRead,
  ),
  HOUSEKEEPING: pick(
    PERMISSIONS.dashboardRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.dormitoriesRead,
    PERMISSIONS.roomsRead,
    PERMISSIONS.housekeepingRead,
    PERMISSIONS.housekeepingExecute,
    PERMISSIONS.maintenanceRead,
    PERMISSIONS.maintenanceCreate,
    PERMISSIONS.reportsRead,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsRead,
  ),
  MAINTENANCE: pick(
    PERMISSIONS.dashboardRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.dormitoriesRead,
    PERMISSIONS.roomsRead,
    PERMISSIONS.maintenanceRead,
    PERMISSIONS.maintenanceCreate,
    PERMISSIONS.maintenanceUpdate,
    PERMISSIONS.maintenanceBlockInventory,
    PERMISSIONS.reportsRead,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsRead,
  ),
  CREW: pick(
    PERMISSIONS.dashboardRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.dormitoriesRead,
    PERMISSIONS.roomsRead,
    PERMISSIONS.availabilityRead,
    PERMISSIONS.reservationsRead,
    PERMISSIONS.reservationsCreate,
    PERMISSIONS.reservationsUpdate,
    PERMISSIONS.reservationsCancel,
    PERMISSIONS.allocationsRead,
    PERMISSIONS.staysRead,
    PERMISSIONS.reportsRead,
    PERMISSIONS.attachmentsUpload,
    PERMISSIONS.attachmentsRead,
  ),
  AUDITOR: pick(
    PERMISSIONS.dashboardRead,
    PERMISSIONS.locationsRead,
    PERMISSIONS.dormitoriesRead,
    PERMISSIONS.roomsRead,
    PERMISSIONS.availabilityRead,
    PERMISSIONS.reservationsRead,
    PERMISSIONS.allocationsRead,
    PERMISSIONS.staysRead,
    PERMISSIONS.housekeepingRead,
    PERMISSIONS.maintenanceRead,
    PERMISSIONS.rosterRead,
    PERMISSIONS.reportsRead,
    PERMISSIONS.reportsExport,
    PERMISSIONS.employeesRead,
    PERMISSIONS.usersRead,
    PERMISSIONS.auditRead,
    PERMISSIONS.attachmentsRead,
  ),
};

const DEMO_EMAIL_DOMAIN = 'demo.whoosh-stay.local';
const MS_PER_DAY = 86_400_000;

function todayUtcDate(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface DemoUser {
  email: string;
  displayName: string;
  employeeKey: string;
  dormitoryCode?: string;
  roles: Array<{ role: RoleCode; scopeType: 'GLOBAL' | 'DORMITORY' | 'SELF' | 'ASSIGNED_TASK' }>;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'admin@demo.whoosh-stay.local', displayName: 'Demo System Admin', employeeKey: 'staff-admin', roles: [{ role: ROLES.SYSTEM_ADMIN, scopeType: 'GLOBAL' }] },
  { email: 'manager@demo.whoosh-stay.local', displayName: 'Demo Dormitory Manager', employeeKey: 'staff-manager', roles: [{ role: ROLES.DORMITORY_MANAGER, scopeType: 'GLOBAL' }] },
  { email: 'dormadmin@demo.whoosh-stay.local', displayName: 'Demo Dormitory Admin', employeeKey: 'staff-dormadmin', roles: [{ role: ROLES.DORMITORY_ADMIN, scopeType: 'DORMITORY' }] },
  { email: 'frontdesk@demo.whoosh-stay.local', displayName: 'Demo Front Desk', employeeKey: 'staff-frontdesk', roles: [{ role: ROLES.FRONT_DESK, scopeType: 'DORMITORY' }] },
  { email: 'housekeeping@demo.whoosh-stay.local', displayName: 'Demo Housekeeping', employeeKey: 'staff-housekeeping', roles: [{ role: ROLES.HOUSEKEEPING, scopeType: 'DORMITORY' }] },
  { email: 'maintenance@demo.whoosh-stay.local', displayName: 'Demo Maintenance', employeeKey: 'staff-maintenance', roles: [{ role: ROLES.MAINTENANCE, scopeType: 'DORMITORY' }] },
  { email: 'crew@demo.whoosh-stay.local', displayName: 'Demo Crew', employeeKey: 'crew-1', roles: [{ role: ROLES.CREW, scopeType: 'SELF' }] },
  { email: 'crew2@demo.whoosh-stay.local', displayName: 'Demo Crew Dua', employeeKey: 'crew-2', roles: [{ role: ROLES.CREW, scopeType: 'SELF' }] },
  { email: 'auditor@demo.whoosh-stay.local', displayName: 'Demo Auditor', employeeKey: 'staff-auditor', roles: [{ role: ROLES.AUDITOR, scopeType: 'GLOBAL' }] },
  { email: 'dualrole@demo.whoosh-stay.local', displayName: 'Demo Dual Role Supervisor', employeeKey: 'staff-dualrole', roles: [
    { role: ROLES.DORMITORY_ADMIN, scopeType: 'DORMITORY' },
    { role: ROLES.FRONT_DESK, scopeType: 'DORMITORY' },
  ] },
  { email: 'manager.karawang@demo.whoosh-stay.local', displayName: 'Demo Manager Karawang', employeeKey: 'staff-manager2', dormitoryCode: 'DEMO-DORM-02', roles: [{ role: ROLES.DORMITORY_MANAGER, scopeType: 'DORMITORY' }] },
  { email: 'frontdesk.karawang@demo.whoosh-stay.local', displayName: 'Demo Front Desk Karawang', employeeKey: 'staff-frontdesk2', dormitoryCode: 'DEMO-DORM-02', roles: [{ role: ROLES.FRONT_DESK, scopeType: 'DORMITORY' }] },
];

interface DemoEmployee {
  key: string;
  code: string;
  name: string;
  department: string;
}

const DEMO_STAFF_EMPLOYEES: DemoEmployee[] = [
  { key: 'staff-admin', code: 'DEMO-EMP-0101', name: 'Demo System Admin', department: 'Information Technology' },
  { key: 'staff-manager', code: 'DEMO-EMP-0102', name: 'Demo Dormitory Manager', department: 'Accommodation' },
  { key: 'staff-dormadmin', code: 'DEMO-EMP-0103', name: 'Demo Dormitory Admin', department: 'Accommodation' },
  { key: 'staff-frontdesk', code: 'DEMO-EMP-0104', name: 'Demo Front Desk', department: 'Accommodation' },
  { key: 'staff-housekeeping', code: 'DEMO-EMP-0105', name: 'Demo Housekeeping', department: 'Housekeeping' },
  { key: 'staff-maintenance', code: 'DEMO-EMP-0106', name: 'Demo Maintenance', department: 'Facility Maintenance' },
  { key: 'staff-auditor', code: 'DEMO-EMP-0107', name: 'Demo Auditor', department: 'Internal Audit' },
  { key: 'staff-dualrole', code: 'DEMO-EMP-0108', name: 'Demo Dual Role Supervisor', department: 'Accommodation' },
  { key: 'staff-manager2', code: 'DEMO-EMP-0109', name: 'Demo Manager Karawang', department: 'Accommodation' },
  { key: 'staff-frontdesk2', code: 'DEMO-EMP-0110', name: 'Demo Front Desk Karawang', department: 'Accommodation' },
];

const CREW_NAMES = [
  'Adi Nugraha', 'Bima Prakoso', 'Citra Lestari', 'Dewi Anggraini', 'Eko Saputra',
  'Fajar Ramadhan', 'Gita Puspita', 'Hendra Wijaya', 'Indah Kusuma', 'Joko Santoso',
  'Kartika Sari', 'Lukman Hakim', 'Maya Permatasari', 'Nanda Pratama', 'Oki Setiawan',
  'Putri Maharani', 'Rizky Ananda', 'Sinta Wulandari', 'Taufik Hidayat', 'Umi Kalsum',
];

const DEMO_CREW_EMPLOYEES: DemoEmployee[] = Array.from({ length: 100 }, (_, index) => {
  const number = index + 1;
  return {
    key: `crew-${number}`,
    code: `DEMO-CREW-${String(number).padStart(4, '0')}`,
    name:
      number === 1
        ? 'Demo Crew Satu'
        : number === 2
          ? 'Demo Crew Dua'
          : `${CREW_NAMES[index % CREW_NAMES.length]} ${String(number).padStart(2, '0')}`,
    department: 'Crew Operations',
  };
});

const DEMO_EMPLOYEES: DemoEmployee[] = [...DEMO_STAFF_EMPLOYEES, ...DEMO_CREW_EMPLOYEES];

const DEMO_DORMITORIES = [
  {
    code: 'DEMO-DORM-01',
    short: 'Halim',
    stationCode: 'DEMO-HLM',
    buildings: 1,
    floors: 2,
    roomsPerFloor: 3,
    bedsPerRoom: 5,
  },
  {
    code: 'DEMO-DORM-02',
    short: 'Karawang',
    stationCode: 'DEMO-KWR',
    buildings: 1,
    floors: 2,
    roomsPerFloor: 3,
    bedsPerRoom: 5,
  },
  {
    code: 'DEMO-DORM-03',
    short: 'Padalarang',
    stationCode: 'DEMO-PDL',
    buildings: 1,
    floors: 2,
    roomsPerFloor: 3,
    bedsPerRoom: 5,
  },
  {
    code: 'DEMO-DORM-04',
    short: 'Tegalluar',
    stationCode: 'DEMO-TGL',
    buildings: 1,
    floors: 2,
    roomsPerFloor: 3,
    bedsPerRoom: 5,
  },
  {
    code: 'DEMO-DORM-05',
    short: 'Depo 501',
    stationCode: 'DEMO-DP5',
    buildings: 1,
    floors: 2,
    roomsPerFloor: 3,
    bedsPerRoom: 5,
  },
];

const DEMO_BED_CODES = ['A', 'B', 'C', 'D', 'E'];

export async function seedDatabase(prisma: SeedClient, options: { demo?: boolean } = {}): Promise<SeedSummary> {
  const demo = options.demo ?? true;

  await prisma.$transaction(async (tx) => {
    await tx.systemSetting.upsert({
      where: { key: 'app.name' },
      update: {},
      create: { key: 'app.name', value: 'Whoosh Stay', description: 'Application display name' },
    });
    await tx.systemSetting.upsert({
      where: { key: 'app.timezone' },
      update: {},
      create: { key: 'app.timezone', value: 'Asia/Jakarta', description: 'Operational timezone' },
    });
    await tx.systemSetting.upsert({
      where: { key: 'reservation.defaultApprovalMode' },
      update: {},
      create: {
        key: 'reservation.defaultApprovalMode',
        value: 'ADMIN_APPROVAL',
        description: 'Development default approval mode; production policy pending',
      },
    });
    await tx.systemSetting.upsert({
      where: { key: 'roster.autoConfirmEnabled' },
      update: {},
      create: {
        key: 'roster.autoConfirmEnabled',
        value: false,
        description: 'Auto-confirm disabled until approved (OPEN_DECISIONS)',
      },
    });
  });

  for (const code of PERMISSION_CODES) {
    const separator = code.indexOf('.');
    const module = separator === -1 ? code : code.slice(0, separator);
    const action = separator === -1 ? code : code.slice(separator + 1);
    await prisma.permission.upsert({
      where: { code },
      update: { module, action },
      create: { code, module, action },
    });
  }

  for (const code of ROLE_CODES) {
    await prisma.role.upsert({
      where: { code },
      update: { name: ROLE_LABELS[code] },
      create: { code, name: ROLE_LABELS[code], isSystem: true },
    });
  }

  const permissions = await prisma.permission.findMany();
  const roles = await prisma.role.findMany();
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));
  const roleByCode = new Map(roles.map((role) => [role.code, role]));

  let rolePermissionCount = 0;
  for (const roleCode of ROLE_CODES) {
    const role = roleByCode.get(roleCode);
    if (!role) throw new Error(`Role missing after upsert: ${roleCode}`);
    const data = ROLE_PERMISSIONS[roleCode].map((code) => {
      const permission = permissionByCode.get(code);
      if (!permission) throw new Error(`Permission missing after upsert: ${code}`);
      return { roleId: role.id, permissionId: permission.id };
    });
    await prisma.rolePermission.createMany({ data, skipDuplicates: true });
    rolePermissionCount += data.length;
  }

  // Master locations provided and verified by the operational team (Phase 3).
  // Addresses are intentionally absent until verified; not every location has lodging.
  for (const location of [
    { code: 'HALIM', name: 'Halim', description: 'Lokasi operasional Halim.' },
    { code: 'KARAWANG', name: 'Karawang', description: 'Lokasi operasional Karawang.' },
    { code: 'PADALARANG', name: 'Padalarang', description: 'Lokasi operasional Padalarang.' },
    { code: 'TEGALLUAR', name: 'Tegalluar', description: 'Lokasi operasional Tegalluar.' },
    { code: 'DEPO-501', name: 'Depo 501', description: 'Lokasi Depo 501.' },
  ]) {
    await prisma.location.upsert({
      where: { code: location.code },
      update: {},
      create: location,
    });
  }

  if (!demo) {
    return {
      permissions: permissions.length,
      roles: roles.length,
      rolePermissions: rolePermissionCount,
      users: 0,
      employees: 0,
      dormitories: 0,
      rooms: 0,
      beds: 0,
      reservations: 0,
      housekeepingTasks: 0,
      maintenanceTickets: 0,
      rosterAssignments: 0,
    };
  }

  for (const [key, value, description] of [
    [
      'availability.readinessWindowHours',
      0,
      'D-008 pending business decision; 0 disables the readiness window enforcement.',
    ],
    ['notifications.emailEnabled', false, 'Email delivery uses a development mock provider.'],
    ['notifications.telegramEnabled', false, 'Telegram delivery uses a development mock provider.'],
  ] as const) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value, description },
    });
  }

  const roomTypeStandard = await prisma.roomType.upsert({
    where: { code: 'DEMO-STD' },
    update: { defaultCapacity: 5 },
    create: { code: 'DEMO-STD', name: 'DEMO Kamar Standar', defaultCapacity: 5, status: 'ACTIVE' },
  });
  const roomTypeTwin = await prisma.roomType.upsert({
    where: { code: 'DEMO-TWIN' },
    update: { defaultCapacity: 5 },
    create: { code: 'DEMO-TWIN', name: 'DEMO Kamar Twin', defaultCapacity: 5, status: 'ACTIVE' },
  });

  const facilities = await Promise.all(
    [
      { code: 'DEMO-WIFI', name: 'DEMO Wi-Fi' },
      { code: 'DEMO-BATH', name: 'DEMO Kamar Mandi Dalam' },
      { code: 'DEMO-AC', name: 'DEMO Penyejuk Udara' },
    ].map((facility) =>
      prisma.facility.upsert({
        where: { code: facility.code },
        update: { name: facility.name },
        create: { ...facility, status: 'ACTIVE' },
      }),
    ),
  );

  const dormitoryByCode = new Map<string, { id: string; name: string; stationCode: string | null }>();
  const allBeds: Array<{ id: string; roomId: string; dormitoryId: string; bedCode: string }> = [];
  const allRooms: Array<{ id: string; roomNumber: string; dormitoryId: string; bedIds: string[] }> =
    [];
  let roomIndex = 0;

  for (const spec of DEMO_DORMITORIES) {
    const dormitory = await prisma.dormitory.upsert({
      where: { code: spec.code },
      update: { name: `DEMO Dormitory ${spec.short} (fiktif)`, stationCode: spec.stationCode },
      create: {
        code: spec.code,
        name: `DEMO Dormitory ${spec.short} (fiktif)`,
        description: 'DEMO DATA / SIMULATED DATA. Bukan fasilitas KCIC resmi.',
        address: 'DEMO — alamat fiktif, bukan lokasi nyata',
        stationCode: spec.stationCode,
        contactName: `DEMO Pengelola ${spec.short}`,
        contactPhone: 'DEMO-PHONE-0000',
        status: 'ACTIVE',
      },
    });
    dormitoryByCode.set(spec.code, dormitory);

    for (let buildingIndex = 0; buildingIndex < spec.buildings; buildingIndex += 1) {
      const buildingCode = `DEMO-${String.fromCharCode(65 + buildingIndex)}`;
      const building = await prisma.building.upsert({
        where: { dormitoryId_code: { dormitoryId: dormitory.id, code: buildingCode } },
        update: { name: `DEMO Gedung ${buildingCode}` },
        create: {
          dormitoryId: dormitory.id,
          code: buildingCode,
          name: `DEMO Gedung ${buildingCode}`,
          status: 'ACTIVE',
        },
      });

      for (let floorNumber = 1; floorNumber <= spec.floors; floorNumber += 1) {
        const floor = await prisma.floor.upsert({
          where: { buildingId_floorNumber: { buildingId: building.id, floorNumber } },
          update: {},
          create: { buildingId: building.id, floorNumber, name: `Lantai ${floorNumber}` },
        });

        for (let roomNumberIndex = 1; roomNumberIndex <= spec.roomsPerFloor; roomNumberIndex += 1) {
          const roomNumber = `${floorNumber}0${roomNumberIndex}`;
          const globalIndex = roomIndex;
          const housekeepingStatus =
            globalIndex === 25
              ? 'DIRTY'
              : globalIndex === 26
                ? 'CLEANING'
                : globalIndex === 27
                  ? 'INSPECTION_REQUIRED'
                  : 'READY';
          const room = await prisma.room.upsert({
            where: { floorId_roomNumber: { floorId: floor.id, roomNumber } },
            update: {},
            create: {
              floorId: floor.id,
              roomTypeId: globalIndex % 2 === 0 ? roomTypeStandard.id : roomTypeTwin.id,
              roomNumber,
              name: `DEMO Kamar ${spec.code}-${roomNumber}`,
              genderPolicy: 'UNSPECIFIED',
              operationalStatus: 'ACTIVE',
              housekeepingStatus,
            },
          });
          await prisma.roomFacility.createMany({
            data: facilities.map((facility) => ({ roomId: room.id, facilityId: facility.id })),
            skipDuplicates: true,
          });
          const bedIds: string[] = [];
          for (const bedCode of DEMO_BED_CODES.slice(0, spec.bedsPerRoom)) {
            const bed = await prisma.bed.upsert({
              where: { roomId_bedCode: { roomId: room.id, bedCode } },
              update: {},
              create: {
                roomId: room.id,
                bedCode,
                label: `Tempat tidur ${bedCode}`,
                status: 'ACTIVE',
                housekeepingStatus: housekeepingStatus === 'DIRTY' ? 'DIRTY' : 'READY',
              },
            });
            bedIds.push(bed.id);
            allBeds.push({ id: bed.id, roomId: room.id, dormitoryId: dormitory.id, bedCode });
          }
          allRooms.push({ id: room.id, roomNumber, dormitoryId: dormitory.id, bedIds });
          roomIndex += 1;
        }
      }
    }
  }

  const employeeIdByKey = new Map<string, string>();
  for (const [index, employee] of DEMO_EMPLOYEES.entries()) {
    const legacyCodes =
      employee.key === 'crew-1'
        ? ['DEMO-EMP-0001']
        : employee.key === 'crew-2'
          ? ['DEMO-EMP-0002']
          : [];
    const existing = await prisma.employee.findFirst({
      where: {
        OR: [
          { employeeCode: employee.code },
          ...legacyCodes.map((code) => ({ employeeCode: code })),
        ],
      },
    });
    const data = {
      sourceSystem: 'DEMO',
      externalEmployeeId: employee.code,
      employeeCode: employee.code,
      fullName: employee.name,
      workEmail: `${employee.code.toLowerCase()}@${DEMO_EMAIL_DOMAIN}`,
      departmentCode: employee.department === 'Crew Operations' ? 'DEMO-CREW' : 'DEMO-STAFF',
      departmentName: employee.department,
      positionCode: 'DEMO-POS',
      positionName:
        employee.department === 'Crew Operations' ? 'DEMO Kru Kereta' : 'DEMO Staf Pendukung',
      homeStationCode: DEMO_DORMITORIES[index % DEMO_DORMITORIES.length].stationCode,
      employmentStatus: 'ACTIVE',
      eligibilityStatus: 'ELIGIBLE',
    };
    const record = existing
      ? await prisma.employee.update({ where: { id: existing.id }, data })
      : await prisma.employee.create({ data });
    employeeIdByKey.set(employee.key, record.id);
  }

  const userIdByEmail = new Map<string, string>();
  for (const demoUser of DEMO_USERS) {
    const employeeId = employeeIdByKey.get(demoUser.employeeKey) ?? null;
    const dormitory = dormitoryByCode.get(demoUser.dormitoryCode ?? 'DEMO-DORM-01');
    if (!demoPasswordHash) demoPasswordHash = await hashDemoPassword(DEMO_PASSWORD);
    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {
        displayName: demoUser.displayName,
        employeeId,
        status: 'ACTIVE',
        demoPasswordHash,
      },
      create: {
        email: demoUser.email,
        displayName: demoUser.displayName,
        demoPasswordHash,
        employeeId,
        status: 'ACTIVE',
      },
    });
    userIdByEmail.set(demoUser.email, user.id);
    await prisma.userRole.deleteMany({ where: { userId: user.id } });
    const roleRows = demoUser.roles.map((assignment) => {
      const role = roleByCode.get(assignment.role);
      if (!role) throw new Error(`Role missing after upsert: ${assignment.role}`);
      return {
        userId: user.id,
        roleId: role.id,
        scopeType: assignment.scopeType,
        scopeId:
          assignment.scopeType === 'DORMITORY'
            ? (dormitory?.id ?? dormitoryByCode.get('DEMO-DORM-01')!.id)
            : null,
      };
    });
    await prisma.userRole.createMany({ data: roleRows, skipDuplicates: true });
  }

  const crewEmployeeIds = DEMO_CREW_EMPLOYEES.map((employee) => employeeIdByKey.get(employee.key)!);
  const managerUserId = userIdByEmail.get('manager@demo.whoosh-stay.local')!;
  const frontDeskUserId = userIdByEmail.get('frontdesk@demo.whoosh-stay.local')!;
  const housekeepingUserId = userIdByEmail.get('housekeeping@demo.whoosh-stay.local')!;
  const maintenanceUserId = userIdByEmail.get('maintenance@demo.whoosh-stay.local')!;
  const adminUserId = userIdByEmail.get('admin@demo.whoosh-stay.local')!;
  const dormAdminUserId = userIdByEmail.get('dormadmin@demo.whoosh-stay.local')!;

  const today = todayUtcDate();
  const existingSeedReservation = await prisma.reservation.findUnique({
    where: { bookingCode: 'DEMO-RSV-0001' },
  });

  if (!existingSeedReservation) {
    for (let index = 0; index < 200; index += 1) {
      const bed = allBeds[index % allBeds.length];
      const employeeId = crewEmployeeIds[index < 120 ? index % 100 : (index - 120) % 100];
      const mode = index % 10;
      let status: string;
      let approvalStatus: string;
      let allocationStatus: 'HELD' | 'ACTIVE' | 'RELEASED' | 'CANCELLED' | null = null;
      let checkInDate: Date;
      let checkOutDate: Date;
      let checkInRecord = false;
      let checkOutRecord = false;
      let approvalDecision: 'PENDING' | 'APPROVED' | 'REJECTED' | null = null;

      if (index < 120) {
        checkInDate = addDays(today, -40 + (index % 20));
        checkOutDate = addDays(checkInDate, 2);
        if (mode <= 6) {
          status = 'CHECKED_OUT';
          approvalStatus = 'APPROVED';
          allocationStatus = 'RELEASED';
          checkInRecord = true;
          checkOutRecord = true;
          approvalDecision = 'APPROVED';
        } else if (mode === 7) {
          status = 'CANCELLED';
          approvalStatus = 'NOT_REQUIRED';
        } else if (mode === 8) {
          status = 'NO_SHOW';
          approvalStatus = 'APPROVED';
          approvalDecision = 'APPROVED';
        } else {
          status = 'REJECTED';
          approvalStatus = 'REJECTED';
          approvalDecision = 'REJECTED';
        }
      } else if (index < 128) {
        checkInDate = addDays(today, -1);
        checkOutDate = addDays(today, 2);
        status = 'CHECKED_IN';
        approvalStatus = 'APPROVED';
        allocationStatus = 'ACTIVE';
        checkInRecord = true;
        approvalDecision = 'APPROVED';
      } else if (index < 158) {
        checkInDate = addDays(today, 2 + (index % 10));
        checkOutDate = addDays(checkInDate, 2);
        if (mode <= 4) {
          status = 'CONFIRMED';
          approvalStatus = 'APPROVED';
          allocationStatus = 'HELD';
          approvalDecision = 'APPROVED';
        } else {
          status = 'PENDING_APPROVAL';
          approvalStatus = 'PENDING';
          allocationStatus = 'HELD';
          approvalDecision = 'PENDING';
        }
      } else {
        checkInDate = addDays(today, 5 + (index % 20));
        checkOutDate = addDays(checkInDate, 1 + (index % 3));
        if (mode <= 5) {
          status = 'CONFIRMED';
          approvalStatus = 'APPROVED';
          allocationStatus = 'HELD';
          approvalDecision = 'APPROVED';
        } else if (mode <= 8) {
          status = 'PENDING_APPROVAL';
          approvalStatus = 'PENDING';
          allocationStatus = 'HELD';
          approvalDecision = 'PENDING';
        } else {
          status = 'CANCELLED';
          approvalStatus = 'NOT_REQUIRED';
        }
      }

      const bookingCode = `DEMO-RSV-${String(index + 1).padStart(4, '0')}`;
      const requestedAt = new Date(checkInDate.getTime() - 7 * MS_PER_DAY);
      const reservation = await prisma.reservation.create({
        data: {
          bookingCode,
          primaryEmployeeId: employeeId,
          dormitoryId: bed.dormitoryId,
          source: index % 3 === 0 ? 'MANAGEMENT' : 'CREW',
          sourceReference: 'DEMO_SEED_V1',
          checkInDate,
          checkOutDate,
          occupantCount: 1,
          purpose:
            index % 4 === 0
              ? 'DEMO: penugasan dinas antar stasiun'
              : index % 4 === 1
                ? 'DEMO: istirahat sebelum shift pagi'
                : index % 4 === 2
                  ? 'DEMO: pelatihan operasional'
                  : 'DEMO: perjalanan dinas',
          status,
          approvalStatus,
          requestedAt,
          createdAt: requestedAt,
          confirmedAt:
            approvalStatus === 'APPROVED' ? new Date(requestedAt.getTime() + 3_600_000) : null,
          cancelledAt: status === 'CANCELLED' ? new Date(requestedAt.getTime() + 7_200_000) : null,
          cancellationReason:
            status === 'CANCELLED' ? 'DEMO: dibatalkan oleh kru (data simulasi)' : null,
          createdBy: index % 3 === 0 ? frontDeskUserId : null,
          approvedBy: approvalStatus === 'APPROVED' ? managerUserId : null,
          approvedAt:
            approvalStatus === 'APPROVED' ? new Date(requestedAt.getTime() + 3_600_000) : null,
        },
      });
      const guest = await prisma.reservationGuest.create({
        data: { reservationId: reservation.id, employeeId, guestRole: 'PRIMARY' },
      });

      if (allocationStatus) {
        await prisma.bedAllocation.create({
          data: {
            reservationId: reservation.id,
            reservationGuestId: guest.id,
            bedId: bed.id,
            stayStart: checkInDate,
            stayEnd: checkOutDate,
            status: allocationStatus,
            allocatedAt: requestedAt,
            releasedAt:
              allocationStatus === 'RELEASED'
                ? new Date(checkOutDate.getTime() + 6 * 3_600_000)
                : null,
            allocatedBy: frontDeskUserId,
          },
        });
      }
      if (checkInRecord) {
        await prisma.checkinRecord.create({
          data: {
            reservationId: reservation.id,
            employeeId,
            checkedInAt: new Date(checkInDate.getTime() + 14 * 3_600_000),
            verifiedBy: frontDeskUserId,
            verificationMethod: 'QR',
            notes: 'DEMO: check-in simulasi',
          },
        });
      }
      if (checkOutRecord) {
        await prisma.checkoutRecord.create({
          data: {
            reservationId: reservation.id,
            employeeId,
            checkedOutAt: new Date(checkOutDate.getTime() + 8 * 3_600_000),
            verifiedBy: frontDeskUserId,
            roomCondition: 'GOOD',
            notes: 'DEMO: check-out simulasi',
          },
        });
      }
      if (approvalDecision) {
        await prisma.reservationApproval.create({
          data: {
            reservationId: reservation.id,
            stepNumber: 1,
            approverRoleCode: 'DORMITORY_MANAGER',
            approverUserId: approvalDecision === 'PENDING' ? null : managerUserId,
            status: approvalDecision,
            decisionAt:
              approvalDecision === 'PENDING' ? null : new Date(requestedAt.getTime() + 3_600_000),
            comments:
              approvalDecision === 'REJECTED'
                ? 'DEMO: kapasitas tidak tersedia pada tanggal tersebut'
                : null,
          },
        });
      }
      await prisma.reservationEvent.createMany({
        data: [
          {
            reservationId: reservation.id,
            eventType: 'RESERVATION_CREATED',
            toStatus: status === 'PENDING_APPROVAL' ? 'PENDING_APPROVAL' : 'CONFIRMED',
            actorUserId: index % 3 === 0 ? frontDeskUserId : null,
            createdAt: requestedAt,
            metadata: { demo: true },
          },
          {
            reservationId: reservation.id,
            eventType: `STATUS_${status}`,
            toStatus: status,
            actorUserId: managerUserId,
            createdAt: new Date(requestedAt.getTime() + 3_600_000),
            metadata: { demo: true },
          },
        ],
      });
    }
  }

  const hasConflict = async (bedId: string, start: Date, end: Date) =>
    (await prisma.bedAllocation.findFirst({
      where: {
        bedId,
        status: { in: ['HELD', 'ACTIVE'] },
        stayStart: { lt: end },
        stayEnd: { gt: start },
      },
      select: { id: true },
    })) !== null;

  const findFreeBed = async (start: Date, end: Date, fromIndex: number) => {
    for (let offset = 0; offset < allBeds.length; offset += 1) {
      const candidate = allBeds[(fromIndex + offset) % allBeds.length];
      if (!(await hasConflict(candidate.id, start, end))) return candidate;
    }
    return null;
  };

  const trendScenarios = [
    ...Array.from({ length: 7 }, (_, k) => ({ kind: 'ARRIVAL' as const, offset: k })),
    ...Array.from({ length: 7 }, (_, k) => ({ kind: 'DEPARTURE' as const, offset: k })),
  ];

  for (const [index, scenario] of trendScenarios.entries()) {
    const bookingCode = `DEMO-TREND-${scenario.kind === 'ARRIVAL' ? 'ARR' : 'DEP'}-${String(
      scenario.offset + 1,
    ).padStart(2, '0')}`;
    const existing = await prisma.reservation.findUnique({ where: { bookingCode } });
    if (existing) continue;

    const checkInDate =
      scenario.kind === 'ARRIVAL'
        ? addDays(today, -scenario.offset)
        : addDays(today, -scenario.offset - 3);
    const checkOutDate =
      scenario.kind === 'ARRIVAL'
        ? addDays(today, 2)
        : addDays(today, -scenario.offset);
    const bed = await findFreeBed(checkInDate, checkOutDate, index * 11 + 3);
    if (!bed) continue;

    const employeeId = crewEmployeeIds[index % crewEmployeeIds.length];
    const requestedAt = new Date(checkInDate.getTime() - 3 * MS_PER_DAY);
    const checkedOut = scenario.kind === 'DEPARTURE';
    const reservation = await prisma.reservation.create({
      data: {
        bookingCode,
        primaryEmployeeId: employeeId,
        dormitoryId: bed.dormitoryId,
        source: 'CREW',
        sourceReference: 'DEMO_TREND_SEED',
        checkInDate,
        checkOutDate,
        occupantCount: 1,
        purpose: checkedOut
          ? 'DEMO: perjalanan dinas selesai'
          : 'DEMO: istirahat kru sebelum shift',
        status: checkedOut ? 'CHECKED_OUT' : 'CHECKED_IN',
        approvalStatus: 'APPROVED',
        requestedAt,
        createdAt: requestedAt,
        confirmedAt: new Date(requestedAt.getTime() + 3_600_000),
      },
    });
    const guest = await prisma.reservationGuest.create({
      data: { reservationId: reservation.id, employeeId, guestRole: 'PRIMARY' },
    });
    await prisma.bedAllocation.create({
      data: {
        reservationId: reservation.id,
        reservationGuestId: guest.id,
        bedId: bed.id,
        stayStart: checkInDate,
        stayEnd: checkOutDate,
        status: checkedOut ? 'RELEASED' : 'ACTIVE',
        allocatedAt: requestedAt,
        releasedAt: checkedOut
          ? new Date(checkOutDate.getTime() + 6 * 3_600_000)
          : null,
        allocatedBy: frontDeskUserId,
      },
    });
    await prisma.checkinRecord.create({
      data: {
        reservationId: reservation.id,
        employeeId,
        checkedInAt: new Date(checkInDate.getTime() + 8 * 3_600_000),
        verifiedBy: frontDeskUserId,
        verificationMethod: 'QR',
        notes: 'DEMO: check-in simulasi',
      },
    });
    if (checkedOut) {
      await prisma.checkoutRecord.create({
        data: {
          reservationId: reservation.id,
          employeeId,
          checkedOutAt: new Date(checkOutDate.getTime() + 10 * 3_600_000),
          verifiedBy: frontDeskUserId,
          roomCondition: 'GOOD',
          notes: 'DEMO: check-out simulasi',
        },
      });
    }
    await prisma.reservationApproval.create({
      data: {
        reservationId: reservation.id,
        stepNumber: 1,
        approverRoleCode: 'DORMITORY_MANAGER',
        approverUserId: managerUserId,
        status: 'APPROVED',
        decisionAt: new Date(requestedAt.getTime() + 3_600_000),
      },
    });
    await prisma.reservationEvent.createMany({
      data: [
        {
          reservationId: reservation.id,
          eventType: 'RESERVATION_CREATED',
          toStatus: 'CONFIRMED',
          actorUserId: frontDeskUserId,
          createdAt: requestedAt,
          metadata: { demo: true, trend: true },
        },
        {
          reservationId: reservation.id,
          eventType: `STATUS_${checkedOut ? 'CHECKED_OUT' : 'CHECKED_IN'}`,
          toStatus: checkedOut ? 'CHECKED_OUT' : 'CHECKED_IN',
          actorUserId: frontDeskUserId,
          createdAt: new Date(checkInDate.getTime() + 8 * 3_600_000),
          metadata: { demo: true, trend: true },
        },
      ],
    });
  }

  if (allRooms.length) {
    const seededHousekeeping = await prisma.housekeepingTask.findFirst({
      where: { notes: { startsWith: 'DEMO-HK-SEED' } },
      select: { id: true },
    });
    if (!seededHousekeeping) {
      const taskStatuses = [
        'PENDING',
        'PENDING',
        'PENDING',
        'PENDING',
        'IN_PROGRESS',
        'IN_PROGRESS',
        'IN_PROGRESS',
        'COMPLETED',
        'COMPLETED',
        'COMPLETED',
        'VERIFIED',
        'VERIFIED',
        'VERIFIED',
        'PENDING',
        'COMPLETED',
      ];
      for (const [index, status] of taskStatuses.entries()) {
        const room = allRooms[(index * 2 + 3) % allRooms.length];
        const taskType =
          index % 5 === 0 ? 'INSPECTION' : index % 7 === 0 ? 'TURNDOWN' : 'CLEANING';
        const scheduledAt = addDays(today, index % 3 === 0 ? 0 : -1);
        scheduledAt.setUTCHours(2 + (index % 8), 0, 0, 0);
        const startedAt = status === 'PENDING' ? null : new Date(scheduledAt.getTime() + 2_700_000);
        const completedAt =
          status === 'COMPLETED' || status === 'VERIFIED'
            ? new Date(scheduledAt.getTime() + 5_400_000)
            : null;
        await prisma.housekeepingTask.create({
          data: {
            roomId: room.id,
            bedId: index % 4 === 0 ? room.bedIds[index % room.bedIds.length] : null,
            taskType,
            status,
            scheduledAt,
            startedAt,
            completedAt,
            assignedTo: housekeepingUserId,
            verifiedBy: status === 'VERIFIED' ? dormAdminUserId : null,
            verifiedAt:
              status === 'VERIFIED' ? new Date(scheduledAt.getTime() + 7_200_000) : null,
            notes: `DEMO-HK-SEED-${String(index + 1).padStart(2, '0')} — data simulasi`,
            checklistItems: {
              create: [
                { itemLabel: 'Ganti linen dan handuk', isCompleted: status !== 'PENDING' },
                { itemLabel: 'Bersihkan kamar mandi', isCompleted: status !== 'PENDING' },
                { itemLabel: 'Periksa fasilitas kamar', isCompleted: status === 'VERIFIED' },
              ],
            },
          },
        });
        if (status !== 'VERIFIED') {
          const roomStatus =
            status === 'PENDING'
              ? 'DIRTY'
              : status === 'IN_PROGRESS'
                ? 'CLEANING'
                : 'INSPECTION_REQUIRED';
          await prisma.room.update({
            where: { id: room.id },
            data: { housekeepingStatus: roomStatus },
          });
        }
      }
    }
  }

  const maintenanceCategories = ['PLUMBING', 'ELECTRICAL', 'FURNITURE', 'AC', 'CLEANLINESS', 'OTHER'];
  const maintenancePriorities = ['LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'CRITICAL'];
  for (let index = 0; index < 10; index += 1) {
    const ticketCode = `DEMO-MT-${String(index + 1).padStart(4, '0')}`;
    const existingTicket = await prisma.maintenanceTicket.findUnique({ where: { ticketCode } });
    if (existingTicket) continue;
    const room = allRooms[(index * 3 + 5) % allRooms.length];
    const status = ['OPEN', 'IN_REVIEW', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'][index % 5];
    const reportedAt = addDays(today, -(index % 6));
    reportedAt.setUTCHours(3 + (index % 9), 30, 0, 0);
    const blocksInventory = index === 0;
    const resolvedAt =
      status === 'RESOLVED' || status === 'CLOSED'
        ? new Date(reportedAt.getTime() + 36 * 3_600_000)
        : null;
    const ticket = await prisma.maintenanceTicket.create({
      data: {
        ticketCode,
        roomId: room.id,
        bedId: index % 3 === 0 ? room.bedIds[index % room.bedIds.length] : null,
        category: maintenanceCategories[index % maintenanceCategories.length],
        priority: maintenancePriorities[index % maintenancePriorities.length],
        description: `DEMO DATA / SIMULATED DATA — laporan kerusakan ${maintenanceCategories[index % maintenanceCategories.length]} di kamar ${room.roomNumber}.`,
        status,
        blocksInventory,
        reportedBy: maintenanceUserId,
        assignedTo: index % 4 === 0 ? null : maintenanceUserId,
        reportedAt,
        resolvedAt,
        closedAt:
          status === 'CLOSED' && resolvedAt ? new Date(resolvedAt.getTime() + 3_600_000) : null,
        resolutionNotes:
          status === 'RESOLVED' || status === 'CLOSED'
            ? 'DEMO: perbaikan selesai (simulasi).'
            : null,
      },
    });
    if (blocksInventory) {
      await prisma.inventoryBlock.create({
        data: {
          roomId: room.id,
          bedId: null,
          startAt: addDays(today, 60),
          endAt: addDays(today, 61),
          blockType: 'MAINTENANCE',
          reason: `DEMO: blokir inventaris untuk tiket ${ticket.ticketCode}`,
          sourceTicketId: ticket.id,
          createdBy: maintenanceUserId,
        },
      });
    }
  }

  for (let dayIndex = 0; dayIndex < 5; dayIndex += 1) {
    for (let crewIndex = 0; crewIndex < 10; crewIndex += 1) {
      const crew = DEMO_CREW_EMPLOYEES[crewIndex];
      const employeeId = employeeIdByKey.get(crew.key)!;
      const dutyDate = addDays(today, dayIndex + 1);
      const station = DEMO_DORMITORIES[crewIndex % DEMO_DORMITORIES.length].stationCode;
      await prisma.rosterAssignment.upsert({
        where: {
          sourceSystem_externalRosterId: {
            sourceSystem: 'SEED_ROSTER',
            externalRosterId: `DEMO-ROSTER-${crew.code}-${dateOnly(dutyDate)}`,
          },
        },
        update: { payloadHash: `seed-${crew.code}-${dateOnly(dutyDate)}` },
        create: {
          sourceSystem: 'SEED_ROSTER',
          externalRosterId: `DEMO-ROSTER-${crew.code}-${dateOnly(dutyDate)}`,
          employeeId,
          dutyDate,
          dutyStart: new Date(`${dateOnly(dutyDate)}T06:00:00+07:00`),
          dutyEnd: new Date(`${dateOnly(dutyDate)}T14:00:00+07:00`),
          stationCode: station,
          rosterStatus: 'FINAL',
          payloadHash: `seed-${crew.code}-${dateOnly(dutyDate)}`,
          sourceUpdatedAt: new Date(),
          syncedAt: new Date(),
        },
      });
    }
  }

  const seedNotifications = [
    {
      email: 'crew@demo.whoosh-stay.local',
      eventCode: 'DEMO_SEED_WELCOME',
      title: 'Selamat datang di Whoosh Stay (DEMO)',
      body: 'Data ini adalah DEMO DATA / SIMULATED DATA. Reservasi dan notifikasi bersifat fiktif.',
    },
    {
      email: 'crew@demo.whoosh-stay.local',
      eventCode: 'DEMO_SEED_STAY',
      title: 'Info menginap simulasi',
      body: 'Pastikan QR check-in hanya digunakan sekali. Data ini disimulasikan untuk demonstrasi.',
    },
    {
      email: 'manager@demo.whoosh-stay.local',
      eventCode: 'DEMO_SEED_APPROVAL',
      title: 'Antrean persetujuan DEMO',
      body: 'Terdapat reservasi simulasi yang menunggu persetujuan Anda.',
    },
    {
      email: 'housekeeping@demo.whoosh-stay.local',
      eventCode: 'DEMO_SEED_HOUSEKEEPING',
      title: 'Tugas housekeeping DEMO',
      body: 'Tugas kebersihan simulasi telah disiapkan untuk demonstrasi alur kerja.',
    },
    {
      email: 'maintenance@demo.whoosh-stay.local',
      eventCode: 'DEMO_SEED_MAINTENANCE',
      title: 'Tiket maintenance DEMO',
      body: 'Tiket maintenance simulasi tersedia untuk demonstrasi penanganan gangguan.',
    },
  ];
  for (const seedNotification of seedNotifications) {
    const userId = userIdByEmail.get(seedNotification.email);
    if (!userId) continue;
    const exists = await prisma.notification.findFirst({
      where: { userId, eventCode: seedNotification.eventCode },
      select: { id: true },
    });
    if (!exists) {
      await prisma.notification.create({
        data: {
          userId,
          eventCode: seedNotification.eventCode,
          title: seedNotification.title,
          body: seedNotification.body,
          referenceType: 'DEMO',
        },
      });
    }
  }

  const demoDelivery = await prisma.notificationDelivery.findFirst({
    where: { providerMessageId: 'mock-email-demo-seed' },
  });
  if (!demoDelivery) {
    const crewNotification = await prisma.notification.findFirst({
      where: { userId: userIdByEmail.get('crew@demo.whoosh-stay.local') ?? undefined },
      orderBy: { createdAt: 'asc' },
    });
    if (crewNotification) {
      await prisma.notificationDelivery.create({
        data: {
          notificationId: crewNotification.id,
          channel: 'EMAIL',
          recipient: 'crew@demo.whoosh-stay.local',
          status: 'MOCK_DELIVERED',
          providerMessageId: 'mock-email-demo-seed',
          attemptCount: 1,
          sentAt: new Date(),
        },
      });
    }
  }

  const existingSeedAudit = await prisma.auditLog.count({ where: { action: 'DEMO_SEED_HISTORY' } });
  if (existingSeedAudit === 0) {
    await prisma.auditLog.createMany({
      data: Array.from({ length: 12 }, (_, index) => ({
        actorUserId: index % 3 === 0 ? adminUserId : frontDeskUserId,
        action: 'DEMO_SEED_HISTORY',
        entityType: 'DEMO_DATA',
        entityId: null,
        afterData: {
          note: 'DEMO DATA / SIMULATED DATA — riwayat audit simulasi',
          step: index + 1,
        },
        ipAddress: '127.0.0.1',
        userAgent: 'whoosh-stay-demo-seed',
        createdAt: addDays(today, -12 + index),
      })),
    });
  }

  await prisma.accommodationPolicy.upsert({
    where: { code: 'DEMO-DEFAULT' },
    update: {},
    create: {
      code: 'DEMO-DEFAULT',
      name: 'DEMO Kebijakan Akomodasi Default (SIMULATED)',
      priority: 100,
      isActive: true,
      approvalMode: 'ADMIN_APPROVAL',
      criteria: { demo: true },
      rules: { maxNights: 14, demo: true },
    },
  });

  const [reservationCount, housekeepingCount, maintenanceCount, rosterCount] = await Promise.all([
    prisma.reservation.count(),
    prisma.housekeepingTask.count(),
    prisma.maintenanceTicket.count(),
    prisma.rosterAssignment.count(),
  ]);

  return {
    permissions: permissions.length,
    roles: roles.length,
    rolePermissions: rolePermissionCount,
    users: DEMO_USERS.length,
    employees: DEMO_EMPLOYEES.length,
    dormitories: DEMO_DORMITORIES.length,
    rooms: allRooms.length,
    beds: allBeds.length,
    reservations: reservationCount,
    housekeepingTasks: housekeepingCount,
    maintenanceTickets: maintenanceCount,
    rosterAssignments: rosterCount,
  };
}
