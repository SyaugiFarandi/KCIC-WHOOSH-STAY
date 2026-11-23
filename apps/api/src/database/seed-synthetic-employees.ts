import { prisma } from '../lib/prisma.js';

// Synthetic employee profiles for UI/flow testing only.
// These are NOT real KCIC employees. No login accounts are created.
// Emails use the reserved, non-routable example.invalid domain.

const databaseUrl = process.env.DATABASE_URL ?? '';
if (process.env.NODE_ENV === 'production') {
  throw new Error('Seed sintetis tidak boleh dijalankan pada lingkungan production.');
}
if (/whoosh_stay_(test|e2e)/.test(databaseUrl)) {
  throw new Error('Seed sintetis hanya untuk database pengembangan (whoosh_stay).');
}

const SOURCE = 'SYNTHETIC';
const EMAIL_DOMAIN = 'example.invalid';
const TOTAL = 60;
const PER_LOCATION = 12;

const LOCATION_CODES = ['HALIM', 'KARAWANG', 'PADALARANG', 'TEGALLUAR', 'DEPO-501'];

interface OrgRef {
  type: 'DEPARTMENT' | 'DIVISION' | 'POSITION';
  code: string;
  name: string;
}

const DEPARTMENTS: OrgRef[] = [
  { type: 'DEPARTMENT', code: 'SYN-DEP-OPS', name: 'Operasi Perjalanan' },
  { type: 'DEPARTMENT', code: 'SYN-DEP-FAS', name: 'Fasilitas dan Hunian' },
  { type: 'DEPARTMENT', code: 'SYN-DEP-MNT', name: 'Pemeliharaan Sarana' },
  { type: 'DEPARTMENT', code: 'SYN-DEP-SEC', name: 'Keamanan dan Keselamatan' },
  { type: 'DEPARTMENT', code: 'SYN-DEP-ADM', name: 'Administrasi dan Umum' },
];

const DIVISIONS: OrgRef[] = [
  { type: 'DIVISION', code: 'SYN-DIV-OPS-CREW', name: 'Kru Perjalanan' },
  { type: 'DIVISION', code: 'SYN-DIV-OPS-CTRL', name: 'Pengendalian Operasi' },
  { type: 'DIVISION', code: 'SYN-DIV-FAS-HUN', name: 'Pengelolaan Hunian' },
  { type: 'DIVISION', code: 'SYN-DIV-FAS-LAY', name: 'Layanan Fasilitas' },
  { type: 'DIVISION', code: 'SYN-DIV-MNT-SAR', name: 'Pemeliharaan Sarana' },
  { type: 'DIVISION', code: 'SYN-DIV-MNT-PRAS', name: 'Pemeliharaan Prasarana' },
  { type: 'DIVISION', code: 'SYN-DIV-SEC-PAM', name: 'Pengamanan' },
  { type: 'DIVISION', code: 'SYN-DIV-SEC-K3', name: 'Keselamatan Kerja' },
  { type: 'DIVISION', code: 'SYN-DIV-ADM-UM', name: 'Umum' },
  { type: 'DIVISION', code: 'SYN-DIV-ADM-SDM', name: 'Administrasi SDM' },
];

const POSITIONS: OrgRef[] = [
  { type: 'POSITION', code: 'SYN-POS-OPS-SPV', name: 'Supervisor Operasi' },
  { type: 'POSITION', code: 'SYN-POS-OPS-KRU', name: 'Kru Perjalanan' },
  { type: 'POSITION', code: 'SYN-POS-OPS-CTRL', name: 'Staf Pengendalian Operasi' },
  { type: 'POSITION', code: 'SYN-POS-FAS-SPV', name: 'Supervisor Fasilitas' },
  { type: 'POSITION', code: 'SYN-POS-FAS-HUN', name: 'Staf Pengelolaan Hunian' },
  { type: 'POSITION', code: 'SYN-POS-FAS-LAY', name: 'Staf Layanan Fasilitas' },
  { type: 'POSITION', code: 'SYN-POS-MNT-SPV', name: 'Supervisor Pemeliharaan' },
  { type: 'POSITION', code: 'SYN-POS-MNT-TEK', name: 'Teknisi Sarana' },
  { type: 'POSITION', code: 'SYN-POS-MNT-ADM', name: 'Staf Administrasi Pemeliharaan' },
  { type: 'POSITION', code: 'SYN-POS-SEC-SPV', name: 'Supervisor Keamanan' },
  { type: 'POSITION', code: 'SYN-POS-SEC-ANG', name: 'Anggota Pengamanan' },
  { type: 'POSITION', code: 'SYN-POS-SEC-K3', name: 'Staf Keselamatan Kerja' },
  { type: 'POSITION', code: 'SYN-POS-ADM-SPV', name: 'Supervisor Administrasi' },
  { type: 'POSITION', code: 'SYN-POS-ADM-STAF', name: 'Staf Administrasi' },
  { type: 'POSITION', code: 'SYN-POS-ADM-UM', name: 'Staf Umum' },
];

const ORG_REFS: OrgRef[] = [...DEPARTMENTS, ...DIVISIONS, ...POSITIONS];
const refByCode = new Map(ORG_REFS.map((ref) => [ref.code, ref]));

interface GroupSpec {
  department: string;
  size: number;
  supervisorPosition: string;
  staffPositions: string[];
  divisions: string[];
}

const GROUPS: GroupSpec[] = [
  {
    department: 'SYN-DEP-OPS',
    size: 3,
    supervisorPosition: 'SYN-POS-OPS-SPV',
    staffPositions: ['SYN-POS-OPS-KRU', 'SYN-POS-OPS-CTRL'],
    divisions: ['SYN-DIV-OPS-CREW', 'SYN-DIV-OPS-CTRL'],
  },
  {
    department: 'SYN-DEP-FAS',
    size: 3,
    supervisorPosition: 'SYN-POS-FAS-SPV',
    staffPositions: ['SYN-POS-FAS-HUN', 'SYN-POS-FAS-LAY'],
    divisions: ['SYN-DIV-FAS-HUN', 'SYN-DIV-FAS-LAY'],
  },
  {
    department: 'SYN-DEP-MNT',
    size: 2,
    supervisorPosition: 'SYN-POS-MNT-SPV',
    staffPositions: ['SYN-POS-MNT-TEK', 'SYN-POS-MNT-ADM'],
    divisions: ['SYN-DIV-MNT-SAR', 'SYN-DIV-MNT-PRAS'],
  },
  {
    department: 'SYN-DEP-SEC',
    size: 2,
    supervisorPosition: 'SYN-POS-SEC-SPV',
    staffPositions: ['SYN-POS-SEC-ANG', 'SYN-POS-SEC-K3'],
    divisions: ['SYN-DIV-SEC-PAM', 'SYN-DIV-SEC-K3'],
  },
  {
    department: 'SYN-DEP-ADM',
    size: 2,
    supervisorPosition: 'SYN-POS-ADM-SPV',
    staffPositions: ['SYN-POS-ADM-STAF', 'SYN-POS-ADM-UM'],
    divisions: ['SYN-DIV-ADM-UM', 'SYN-DIV-ADM-SDM'],
  },
];

const GIVEN_NAMES = [
  'Aditya', 'Bagas', 'Citra', 'Dewi', 'Eka', 'Fajar', 'Gita', 'Hadi', 'Indah', 'Joko',
  'Kirana', 'Lukman', 'Maya', 'Nanda', 'Okta', 'Putri', 'Qori', 'Raka', 'Sari', 'Tegar',
  'Ulfa', 'Vina', 'Wawan', 'Yuni', 'Zaki', 'Bima', 'Ayu', 'Damar', 'Elsya', 'Farah',
];
const FAMILY_NAMES = [
  'Pratama', 'Nugroho', 'Santoso', 'Wibowo', 'Kusuma', 'Halim', 'Ramadhan', 'Saputra',
  'Lestari', 'Hidayat', 'Maharani', 'Syahputra', 'Anggraini', 'Firmansyah', 'Utami',
  'Wijaya', 'Prasetyo', 'Handayani', 'Saputri', 'Kurniawan',
];

function syntheticName(index: number): string {
  const given = GIVEN_NAMES[index % GIVEN_NAMES.length];
  const family =
    FAMILY_NAMES[(index * 7 + Math.floor(index / GIVEN_NAMES.length)) % FAMILY_NAMES.length];
  return `${given} ${family}`;
}

interface SyntheticProfile {
  employeeCode: string;
  fullName: string;
  workEmail: string;
  departmentCode: string;
  departmentName: string;
  divisionCode: string;
  divisionName: string;
  positionCode: string;
  positionName: string;
  homeStationCode: string;
  joinDate: Date;
  employmentStatus: string;
  supervisorCode: string | null;
}

function buildProfiles(): SyntheticProfile[] {
  const profiles: SyntheticProfile[] = [];
  let index = 0;
  for (const locationCode of LOCATION_CODES) {
    let locationLeadCode: string | null = null;
    for (const group of GROUPS) {
      let groupSupervisorCode: string | null = null;
      for (let member = 0; member < group.size; member += 1) {
        index += 1;
        const employeeCode = `WS-EMP-${String(index).padStart(4, '0')}`;
        const isSupervisor = member === 0;
        const positionCode = isSupervisor
          ? group.supervisorPosition
          : group.staffPositions[(member - 1) % group.staffPositions.length];
        const divisionCode = isSupervisor
          ? group.divisions[0]
          : group.divisions[(member - 1) % group.divisions.length];
        const position = refByCode.get(positionCode)!;
        const division = refByCode.get(divisionCode)!;
        const department = refByCode.get(group.department)!;

        let employmentStatus = 'ACTIVE';
        if (!isSupervisor) {
          if (index % 20 === 0) employmentStatus = 'RESIGNED';
          else if (index % 15 === 0) employmentStatus = 'INACTIVE';
        }

        let supervisorCode: string | null = null;
        if (isSupervisor) {
          groupSupervisorCode = employeeCode;
          if (group.department === 'SYN-DEP-OPS') {
            locationLeadCode = employeeCode;
          } else {
            supervisorCode = locationLeadCode;
          }
        } else {
          supervisorCode = groupSupervisorCode;
        }

        profiles.push({
          employeeCode,
          fullName: syntheticName(index - 1),
          workEmail: `${employeeCode.toLowerCase()}@${EMAIL_DOMAIN}`,
          departmentCode: department.code,
          departmentName: department.name,
          divisionCode: division.code,
          divisionName: division.name,
          positionCode: position.code,
          positionName: position.name,
          homeStationCode: locationCode,
          joinDate: new Date(Date.UTC(2019, 0, 15) + (index - 1) * 37 * 86_400_000),
          employmentStatus,
          supervisorCode,
        });
      }
    }
  }
  return profiles;
}

async function main(): Promise<void> {
  const profiles = buildProfiles();
  if (profiles.length !== TOTAL || profiles.length !== PER_LOCATION * LOCATION_CODES.length) {
    throw new Error('Konfigurasi seed tidak konsisten; jumlah profil tidak sesuai.');
  }

  const locations = await prisma.location.findMany({
    where: { code: { in: LOCATION_CODES } },
    select: { code: true },
  });
  const missing = LOCATION_CODES.filter(
    (code) => !locations.some((location) => location.code === code),
  );
  if (missing.length > 0) {
    throw new Error(`Master lokasi belum lengkap: ${missing.join(', ')}. Jalankan seed lokasi dulu.`);
  }

  const codes = profiles.map((profile) => profile.employeeCode);
  const conflicting = await prisma.employee.findMany({
    where: { employeeCode: { in: codes }, sourceSystem: { not: SOURCE } },
    select: { employeeCode: true, sourceSystem: true },
  });
  if (conflicting.length > 0) {
    throw new Error(
      `Kode karyawan sudah dipakai sumber lain (${conflicting
        .map((row) => `${row.employeeCode}:${row.sourceSystem}`)
        .join(', ')}). Seed dibatalkan agar tidak menimpa data operasional.`,
    );
  }

  const existing = await prisma.employee.findMany({
    where: { sourceSystem: SOURCE, externalEmployeeId: { in: codes } },
    select: { externalEmployeeId: true },
  });
  const existingCodes = new Set(existing.map((row) => row.externalEmployeeId));

  const result = await prisma.$transaction(
    async (tx) => {
      for (const ref of ORG_REFS) {
        await tx.orgReference.upsert({
          where: { type_code: { type: ref.type, code: ref.code } },
          update: { name: ref.name },
          create: {
            type: ref.type,
            code: ref.code,
            name: ref.name,
            status: 'UNCONFIRMED',
            sourceSystem: SOURCE,
            description:
              'Referensi organisasi internal sintetis untuk pengujian tampilan; belum dikonfirmasi oleh KCIC.',
          },
        });
      }

      const idByCode = new Map<string, string>();
      for (const profile of profiles) {
        const row = await tx.employee.upsert({
          where: {
            sourceSystem_externalEmployeeId: {
              sourceSystem: SOURCE,
              externalEmployeeId: profile.employeeCode,
            },
          },
          update: {
            employeeCode: profile.employeeCode,
            fullName: profile.fullName,
            workEmail: profile.workEmail,
            departmentCode: profile.departmentCode,
            departmentName: profile.departmentName,
            divisionCode: profile.divisionCode,
            divisionName: profile.divisionName,
            positionCode: profile.positionCode,
            positionName: profile.positionName,
            homeStationCode: profile.homeStationCode,
            joinDate: profile.joinDate,
            employmentStatus: profile.employmentStatus,
          },
          create: {
            sourceSystem: SOURCE,
            externalEmployeeId: profile.employeeCode,
            employeeCode: profile.employeeCode,
            fullName: profile.fullName,
            workEmail: profile.workEmail,
            departmentCode: profile.departmentCode,
            departmentName: profile.departmentName,
            divisionCode: profile.divisionCode,
            divisionName: profile.divisionName,
            positionCode: profile.positionCode,
            positionName: profile.positionName,
            homeStationCode: profile.homeStationCode,
            joinDate: profile.joinDate,
            employmentStatus: profile.employmentStatus,
            eligibilityStatus: 'UNKNOWN',
          },
        });
        idByCode.set(profile.employeeCode, row.id);
      }

      for (const profile of profiles) {
        await tx.employee.update({
          where: { id: idByCode.get(profile.employeeCode)! },
          data: {
            supervisorId: profile.supervisorCode
              ? idByCode.get(profile.supervisorCode)!
              : null,
          },
        });
      }

      const byLocation: Record<string, number> = {};
      for (const profile of profiles) {
        byLocation[profile.homeStationCode] = (byLocation[profile.homeStationCode] ?? 0) + 1;
      }

      await tx.auditLog.create({
        data: {
          action: 'EMPLOYEE_SYNTHETIC_SEED',
          entityType: 'EMPLOYEE',
          reason:
            'Synthetic employee profiles seeded for UI/flow testing; not real KCIC employees; no login accounts created.',
          afterData: {
            sourceSystem: SOURCE,
            total: profiles.length,
            inserted: profiles.length - existingCodes.size,
            updated: existingCodes.size,
            orgReferences: ORG_REFS.length,
            byLocation,
          },
        },
      });

      return { byLocation };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  const inserted = profiles.length - existingCodes.size;
  console.log(`[seed-synthetic] ${profiles.length} profil sintetis (${inserted} baru, ${existingCodes.size} diperbarui).`);
  console.log(`[seed-synthetic] Kode: WS-EMP-0001 s.d. WS-EMP-${String(TOTAL).padStart(4, '0')}.`);
  console.log(`[seed-synthetic] Referensi organisasi: ${ORG_REFS.length} (status UNCONFIRMED).`);
  for (const [code, count] of Object.entries(result.byLocation)) {
    console.log(`[seed-synthetic]   ${code}: ${count}`);
  }
  console.log('[seed-synthetic] Data ini SINTETIS untuk pengujian tampilan, bukan karyawan KCIC sungguhan.');
  console.log('[seed-synthetic] Tidak ada akun login yang dibuat. Email memakai domain example.invalid.');
}

main()
  .catch((error) => {
    console.error('[seed-synthetic] Gagal:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });