import { z } from 'zod';
import { createPaginationQuerySchema, type PaginationMeta } from './schemas.js';

export const POLICY_CATEGORIES = [
  'RESERVATION_ELIGIBILITY',
  'CREW_CATEGORY',
  'MAX_STAY_DURATION',
  'BOOKING_LEAD_TIME',
  'RESERVATION_PRIORITY',
  'DORMITORY_ASSIGNMENT',
  'ROOM_ALLOCATION',
  'BED_CAPACITY',
  'CHECK_IN_RULES',
  'CHECK_OUT_RULES',
  'EARLY_CHECK_IN',
  'LATE_CHECK_OUT',
  'CANCELLATION',
  'EMERGENCY_RESERVATION',
  'ROSTER_DEPENDENCY',
  'OVERBOOKING_PREVENTION',
] as const;

export type PolicyCategory = (typeof POLICY_CATEGORIES)[number];

export const POLICY_CATEGORY_LABELS: Record<PolicyCategory, string> = {
  RESERVATION_ELIGIBILITY: 'Eligibilitas Reservasi',
  CREW_CATEGORY: 'Kategori Kru',
  MAX_STAY_DURATION: 'Durasi Menginap Maksimum',
  BOOKING_LEAD_TIME: 'Jarak Waktu Pemesanan',
  RESERVATION_PRIORITY: 'Prioritas Reservasi',
  DORMITORY_ASSIGNMENT: 'Penetapan Dormitory',
  ROOM_ALLOCATION: 'Alokasi Kamar',
  BED_CAPACITY: 'Kapasitas Tempat Tidur',
  CHECK_IN_RULES: 'Aturan Check-in',
  CHECK_OUT_RULES: 'Aturan Check-out',
  EARLY_CHECK_IN: 'Check-in Lebih Awal',
  LATE_CHECK_OUT: 'Check-out Terlambat',
  CANCELLATION: 'Pembatalan',
  EMERGENCY_RESERVATION: 'Reservasi Darurat',
  ROSTER_DEPENDENCY: 'Ketergantungan Roster',
  OVERBOOKING_PREVENTION: 'Pencegahan Overbooking',
};

export const POLICY_EFFECTS = [
  'ALLOW',
  'DENY',
  'REQUIRES_APPROVAL',
  'REQUIRES_MANUAL_REVIEW',
] as const;

export type PolicyEffect = (typeof POLICY_EFFECTS)[number];

export const POLICY_EFFECT_LABELS: Record<PolicyEffect, string> = {
  ALLOW: 'Izinkan (catat)',
  DENY: 'Tolak',
  REQUIRES_APPROVAL: 'Perlu persetujuan',
  REQUIRES_MANUAL_REVIEW: 'Perlu tinjauan manual',
};

export const POLICY_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type PolicySeverity = (typeof POLICY_SEVERITIES)[number];

export const POLICY_SEVERITY_LABELS: Record<PolicySeverity, string> = {
  CRITICAL: 'Kritis',
  HIGH: 'Tinggi',
  MEDIUM: 'Sedang',
  LOW: 'Rendah',
};

export const POLICY_STATUSES = ['DRAFT', 'ACTIVE', 'INACTIVE'] as const;

export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  DRAFT: 'Draf',
  ACTIVE: 'Aktif',
  INACTIVE: 'Nonaktif',
};

export const POLICY_WORKFLOWS = [
  'RESERVATION_AUTO',
  'RESERVATION_MANUAL',
  'ROOM_ALLOCATION',
  'BED_ALLOCATION',
  'CHECK_IN',
  'CHECK_OUT',
  'CANCELLATION',
  'EMERGENCY_RESERVATION',
] as const;

export type PolicyWorkflow = (typeof POLICY_WORKFLOWS)[number];

export const POLICY_WORKFLOW_LABELS: Record<PolicyWorkflow, string> = {
  RESERVATION_AUTO: 'Reservasi otomatis',
  RESERVATION_MANUAL: 'Reservasi manual',
  ROOM_ALLOCATION: 'Alokasi kamar',
  BED_ALLOCATION: 'Alokasi tempat tidur',
  CHECK_IN: 'Check-in',
  CHECK_OUT: 'Check-out',
  CANCELLATION: 'Pembatalan',
  EMERGENCY_RESERVATION: 'Reservasi darurat',
};

export const POLICY_DECISIONS = [
  'ALLOWED',
  'DENIED',
  'REQUIRES_APPROVAL',
  'REQUIRES_MANUAL_REVIEW',
] as const;

export type PolicyDecision = (typeof POLICY_DECISIONS)[number];

export const POLICY_DECISION_LABELS: Record<PolicyDecision, string> = {
  ALLOWED: 'Diizinkan',
  DENIED: 'Ditolak',
  REQUIRES_APPROVAL: 'Perlu persetujuan',
  REQUIRES_MANUAL_REVIEW: 'Perlu tinjauan manual',
};

/** Highest precedence wins: a denial can never be overridden by an approval rule. */
export const POLICY_DECISION_PRECEDENCE: Record<PolicyDecision, number> = {
  DENIED: 4,
  REQUIRES_MANUAL_REVIEW: 3,
  REQUIRES_APPROVAL: 2,
  ALLOWED: 1,
};

export const POLICY_EFFECT_RESULTS: Record<PolicyEffect, PolicyDecision> = {
  ALLOW: 'ALLOWED',
  DENY: 'DENIED',
  REQUIRES_APPROVAL: 'REQUIRES_APPROVAL',
  REQUIRES_MANUAL_REVIEW: 'REQUIRES_MANUAL_REVIEW',
};

export const POLICY_CONDITION_KEYS = [
  'dormitoryId',
  'occupantCount',
  'isEmergency',
  'priority',
  'hasRosterShift',
  'sameDayCancellation',
] as const;

export type PolicyConditionKey = (typeof POLICY_CONDITION_KEYS)[number];

export const POLICY_CONDITION_KEY_LABELS: Record<PolicyConditionKey, string> = {
  dormitoryId: 'ID dormitory',
  occupantCount: 'Jumlah penghuni',
  isEmergency: 'Reservasi darurat',
  priority: 'Prioritas reservasi',
  hasRosterShift: 'Memiliki shift roster',
  sameDayCancellation: 'Pembatalan hari yang sama',
};

export const POLICY_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'EMERGENCY'] as const;

export type PolicyPriority = (typeof POLICY_PRIORITIES)[number];

export interface PolicyParameterField {
  key: string;
  label: string;
  type: 'number' | 'boolean' | 'stringArray';
  hint: string;
  min?: number;
  max?: number;
}

export interface PolicyCategoryMeta {
  label: string;
  description: string;
  parameterFields: PolicyParameterField[];
  /** Illustrative values only. Never treat these as approved operational policy. */
  exampleParameters: Record<string, unknown>;
}

export const POLICY_CATEGORY_META: Record<PolicyCategory, PolicyCategoryMeta> = {
  RESERVATION_ELIGIBILITY: {
    label: POLICY_CATEGORY_LABELS.RESERVATION_ELIGIBILITY,
    description:
      'Membatasi pembuatan reservasi berdasarkan status kepegawaian atau status eligibilitas karyawan.',
    parameterFields: [
      {
        key: 'allowedEmploymentStatuses',
        label: 'Status kepegawaian yang diizinkan',
        type: 'stringArray',
        hint: 'Daftar status. Kosong berarti semua status diizinkan.',
      },
      {
        key: 'deniedEligibilityStatuses',
        label: 'Status eligibilitas yang ditolak',
        type: 'stringArray',
        hint: 'Contoh terlarang; diisi sesuai keputusan organisasi.',
      },
    ],
    exampleParameters: { allowedEmploymentStatuses: [], deniedEligibilityStatuses: [] },
  },
  CREW_CATEGORY: {
    label: POLICY_CATEGORY_LABELS.CREW_CATEGORY,
    description:
      'Membatasi reservasi berdasarkan departemen, divisi, atau posisi kru. Daftar kosong berarti tidak membatasi.',
    parameterFields: [
      {
        key: 'allowedDepartments',
        label: 'Departemen diizinkan',
        type: 'stringArray',
        hint: 'Kode departemen karyawan.',
      },
      {
        key: 'allowedDivisions',
        label: 'Divisi diizinkan',
        type: 'stringArray',
        hint: 'Kode divisi karyawan.',
      },
      {
        key: 'allowedPositions',
        label: 'Posisi diizinkan',
        type: 'stringArray',
        hint: 'Kode posisi karyawan.',
      },
    ],
    exampleParameters: { allowedDepartments: [], allowedDivisions: [], allowedPositions: [] },
  },
  MAX_STAY_DURATION: {
    label: POLICY_CATEGORY_LABELS.MAX_STAY_DURATION,
    description: 'Membatasi jumlah malam per reservasi.',
    parameterFields: [
      {
        key: 'maxNights',
        label: 'Maksimum malam',
        type: 'number',
        min: 1,
        max: 365,
        hint: 'Batas jumlah malam; nilai harus ditetapkan organisasi.',
      },
    ],
    exampleParameters: { maxNights: 14 },
  },
  BOOKING_LEAD_TIME: {
    label: POLICY_CATEGORY_LABELS.BOOKING_LEAD_TIME,
    description: 'Mengatur jarak hari antara pemesanan dan tanggal check-in.',
    parameterFields: [
      {
        key: 'minLeadDays',
        label: 'Minimum hari sebelum check-in',
        type: 'number',
        min: 0,
        max: 365,
        hint: '0 berarti boleh memesan untuk hari yang sama.',
      },
      {
        key: 'maxLeadDays',
        label: 'Maksimum hari sebelum check-in',
        type: 'number',
        min: 0,
        max: 730,
        hint: 'Batas horizon pemesanan.',
      },
    ],
    exampleParameters: { minLeadDays: 0, maxLeadDays: 90 },
  },
  RESERVATION_PRIORITY: {
    label: POLICY_CATEGORY_LABELS.RESERVATION_PRIORITY,
    description: 'Menetapkan perlakuan khusus untuk level prioritas tertentu.',
    parameterFields: [
      {
        key: 'restrictedPriorities',
        label: 'Prioritas yang dibatasi',
        type: 'stringArray',
        hint: 'Isi LOW, NORMAL, HIGH, atau EMERGENCY. Kosong berarti semua.',
      },
    ],
    exampleParameters: { restrictedPriorities: [] },
  },
  DORMITORY_ASSIGNMENT: {
    label: POLICY_CATEGORY_LABELS.DORMITORY_ASSIGNMENT,
    description: 'Membatasi dormitory yang boleh dipilih pada reservasi.',
    parameterFields: [
      {
        key: 'allowedDormitoryIds',
        label: 'Dormitory diizinkan',
        type: 'stringArray',
        hint: 'ID dormitory. Kosong berarti semua dormitory dalam scope.',
      },
    ],
    exampleParameters: { allowedDormitoryIds: [] },
  },
  ROOM_ALLOCATION: {
    label: POLICY_CATEGORY_LABELS.ROOM_ALLOCATION,
    description: 'Mengatur cara alokasi kamar/tempat tidur saat reservasi atau alokasi.',
    parameterFields: [
      {
        key: 'requireExplicitBed',
        label: 'Wajib memilih tempat tidur eksplisit',
        type: 'boolean',
        hint: 'true menolak alokasi otomatis tanpa bedIds.',
      },
      {
        key: 'maxBedsPerReservation',
        label: 'Maksimum tempat tidur per reservasi',
        type: 'number',
        min: 1,
        max: 10,
        hint: 'Batas jumlah bedIds yang diajukan.',
      },
    ],
    exampleParameters: { requireExplicitBed: false, maxBedsPerReservation: 4 },
  },
  BED_CAPACITY: {
    label: POLICY_CATEGORY_LABELS.BED_CAPACITY,
    description: 'Membatasi jumlah penghuni per reservasi.',
    parameterFields: [
      {
        key: 'maxOccupantsPerReservation',
        label: 'Maksimum penghuni per reservasi',
        type: 'number',
        min: 1,
        max: 10,
        hint: 'Dibandingkan dengan occupantCount.',
      },
    ],
    exampleParameters: { maxOccupantsPerReservation: 4 },
  },
  CHECK_IN_RULES: {
    label: POLICY_CATEGORY_LABELS.CHECK_IN_RULES,
    description: 'Aturan tambahan saat check-in selain validasi kesiapan yang sudah ada.',
    parameterFields: [
      {
        key: 'allowBeforeScheduledDate',
        label: 'Izinkan check-in sebelum tanggal reservasi',
        type: 'boolean',
        hint: 'false menjaga perilaku saat ini (ditolak).',
      },
    ],
    exampleParameters: { allowBeforeScheduledDate: false },
  },
  CHECK_OUT_RULES: {
    label: POLICY_CATEGORY_LABELS.CHECK_OUT_RULES,
    description: 'Aturan tambahan saat check-out selain validasi tamu dan status yang sudah ada.',
    parameterFields: [
      {
        key: 'allowBeforeScheduledDate',
        label: 'Izinkan check-out sebelum tanggal selesai',
        type: 'boolean',
        hint: 'false menjaga perilaku saat ini (ditolak).',
      },
    ],
    exampleParameters: { allowBeforeScheduledDate: false },
  },
  EARLY_CHECK_IN: {
    label: POLICY_CATEGORY_LABELS.EARLY_CHECK_IN,
    description: 'Membatasi check-in lebih awal dari jam mulai operasional pada tanggal check-in.',
    parameterFields: [
      {
        key: 'maxEarlyMinutes',
        label: 'Maksimum menit lebih awal',
        type: 'number',
        min: 0,
        max: 1440,
        hint: 'Dibandingkan dengan earlyCheckInMinutes.',
      },
    ],
    exampleParameters: { maxEarlyMinutes: 0 },
  },
  LATE_CHECK_OUT: {
    label: POLICY_CATEGORY_LABELS.LATE_CHECK_OUT,
    description: 'Membatasi check-out melewati akhir tanggal reservasi.',
    parameterFields: [
      {
        key: 'maxLateMinutes',
        label: 'Maksimum menit terlambat',
        type: 'number',
        min: 0,
        max: 1440,
        hint: 'Dibandingkan dengan lateCheckOutMinutes.',
      },
    ],
    exampleParameters: { maxLateMinutes: 0 },
  },
  CANCELLATION: {
    label: POLICY_CATEGORY_LABELS.CANCELLATION,
    description: 'Mengatur tenggat pemberitahuan pembatalan.',
    parameterFields: [
      {
        key: 'minNoticeHours',
        label: 'Minimum jam pemberitahuan',
        type: 'number',
        min: 0,
        max: 720,
        hint: 'Dibandingkan dengan cancellationNoticeHours.',
      },
      {
        key: 'blockSameDayCancellation',
        label: 'Blokir pembatalan hari yang sama',
        type: 'boolean',
        hint: 'true menolak pembatalan pada tanggal check-in.',
      },
    ],
    exampleParameters: { minNoticeHours: 0, blockSameDayCancellation: false },
  },
  EMERGENCY_RESERVATION: {
    label: POLICY_CATEGORY_LABELS.EMERGENCY_RESERVATION,
    description: 'Perlakuan khusus untuk reservasi darurat (flag isEmergency).',
    parameterFields: [
      {
        key: 'requireReason',
        label: 'Wajib alasan darurat',
        type: 'boolean',
        hint: 'true menolak reservasi darurat tanpa alasan.',
      },
      {
        key: 'allowedPriorities',
        label: 'Prioritas yang boleh ditandai darurat',
        type: 'stringArray',
        hint: 'Kosong berarti semua prioritas.',
      },
    ],
    exampleParameters: { requireReason: true, allowedPriorities: [] },
  },
  ROSTER_DEPENDENCY: {
    label: POLICY_CATEGORY_LABELS.ROSTER_DEPENDENCY,
    description:
      'Menghubungkan reservasi dengan ketersediaan shift roster. Hanya berlaku bila workflow menyuplai sinyal roster.',
    parameterFields: [
      {
        key: 'requireRosterShift',
        label: 'Wajib memiliki shift roster',
        type: 'boolean',
        hint: 'true menerapkan efek ketika hasRosterShift=false.',
      },
    ],
    exampleParameters: { requireRosterShift: true },
  },
  OVERBOOKING_PREVENTION: {
    label: POLICY_CATEGORY_LABELS.OVERBOOKING_PREVENTION,
    description:
      'Membatasi alokasi ketika permintaan melebihi ketersediaan tempat tidur yang tersedia.',
    parameterFields: [
      {
        key: 'requiredSpareBeds',
        label: 'Cadangan tempat tidur wajib',
        type: 'number',
        min: 0,
        max: 100,
        hint: 'Jumlah bed yang harus tetap kosong setelah alokasi.',
      },
      {
        key: 'allowOverbooking',
        label: 'Izinkan overbooking',
        type: 'boolean',
        hint: 'true menjadikan kebijakan sebagai catatan izin, bukan penolakan.',
      },
    ],
    exampleParameters: { requiredSpareBeds: 0, allowOverbooking: false },
  },
};

export function validatePolicyParameters(
  category: PolicyCategory,
  parameters: Record<string, unknown>,
): string[] {
  const meta = POLICY_CATEGORY_META[category];
  const allowed = new Map(meta.parameterFields.map((field) => [field.key, field]));
  const issues: string[] = [];
  for (const [key, value] of Object.entries(parameters)) {
    const field = allowed.get(key);
    if (!field) {
      issues.push(`Parameter "${key}" tidak dikenal untuk kategori ${meta.label}.`);
      continue;
    }
    if (field.type === 'number') {
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        issues.push(`Parameter "${key}" harus berupa bilangan bulat.`);
        continue;
      }
      if (field.min !== undefined && value < field.min) {
        issues.push(`Parameter "${key}" minimal ${field.min}.`);
      }
      if (field.max !== undefined && value > field.max) {
        issues.push(`Parameter "${key}" maksimal ${field.max}.`);
      }
    } else if (field.type === 'boolean') {
      if (typeof value !== 'boolean') {
        issues.push(`Parameter "${key}" harus berupa boolean.`);
      }
    } else if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
      issues.push(`Parameter "${key}" harus berupa daftar teks.`);
    }
  }
  return issues;
}

export const POLICY_CONDITIONS_SCHEMA = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal harus YYYY-MM-DD.');

const policyContentSchema = z.object({
  name: z.string().trim().min(3).max(150),
  description: z.string().trim().max(1000).optional(),
  category: z.enum(POLICY_CATEGORIES),
  effect: z.enum(POLICY_EFFECTS),
  severity: z.enum(POLICY_SEVERITIES).default('MEDIUM'),
  priority: z.number().int().min(1).max(1000).default(100),
  dormitoryId: z.uuid().nullable().optional(),
  effectiveFrom: dateOnlySchema,
  effectiveTo: dateOnlySchema.nullable().optional(),
  parameters: z.record(z.string(), z.unknown()).default({}),
  conditions: POLICY_CONDITIONS_SCHEMA.default({}),
  changeNote: z.string().trim().max(300).optional(),
});

interface PolicyIssueSink {
  addIssue: (issue: { code: 'custom'; path?: (string | number)[]; message: string }) => void;
}

function refinePolicyContent(
  value: {
    category?: PolicyCategory;
    effectiveFrom?: string;
    effectiveTo?: string | null;
    parameters?: Record<string, unknown>;
    conditions?: Record<string, unknown>;
  },
  ctx: PolicyIssueSink,
  options: { requireCategory: boolean },
) {
  if (value.effectiveFrom && value.effectiveTo && value.effectiveTo < value.effectiveFrom) {
    ctx.addIssue({
      code: 'custom',
      path: ['effectiveTo'],
      message: 'Tanggal berlaku akhir tidak boleh sebelum tanggal mulai.',
    });
  }
  if (options.requireCategory && value.category && value.parameters) {
    for (const issue of validatePolicyParameters(value.category, value.parameters)) {
      ctx.addIssue({ code: 'custom', path: ['parameters'], message: issue });
    }
  }
  if (value.conditions) {
    for (const key of Object.keys(value.conditions)) {
      if (!(POLICY_CONDITION_KEYS as readonly string[]).includes(key)) {
        ctx.addIssue({
          code: 'custom',
          path: ['conditions'],
          message: `Kondisi "${key}" tidak didukung.`,
        });
      }
    }
  }
}

export const policyCreateSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9][A-Z0-9_-]{2,49}$/, 'Kode 3-50 karakter: huruf kapital, angka, - atau _.'),
  })
  .merge(policyContentSchema)
  .superRefine((value, ctx) => refinePolicyContent(value, ctx, { requireCategory: true }));

export type PolicyCreateInput = z.infer<typeof policyCreateSchema>;

export const policyUpdateSchema = z
  .object({
    name: z.string().trim().min(3).max(150).optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    category: z.enum(POLICY_CATEGORIES).optional(),
    effect: z.enum(POLICY_EFFECTS).optional(),
    severity: z.enum(POLICY_SEVERITIES).optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    dormitoryId: z.uuid().nullable().optional(),
    effectiveFrom: dateOnlySchema.optional(),
    effectiveTo: dateOnlySchema.nullable().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    conditions: POLICY_CONDITIONS_SCHEMA.optional(),
    expectedVersion: z.number().int().min(1).optional(),
    changeNote: z.string().trim().max(300).optional(),
  })
  .superRefine((value, ctx) => {
    refinePolicyContent(value, ctx, { requireCategory: false });
  });

export type PolicyUpdateInput = z.infer<typeof policyUpdateSchema>;

export const policyActivationSchema = z.object({
  expectedVersion: z.number().int().min(1).optional(),
  note: z.string().trim().max(300).optional(),
});

export type PolicyActivationInput = z.infer<typeof policyActivationSchema>;

export const policyApprovalSchema = z.object({
  note: z.string().trim().min(3).max(300),
});

export type PolicyApprovalInput = z.infer<typeof policyApprovalSchema>;

export const policySimulationSchema = z
  .object({
    workflow: z.enum(POLICY_WORKFLOWS).default('RESERVATION_MANUAL'),
    policyId: z.uuid().optional(),
    dormitoryId: z.uuid().optional(),
    checkInDate: dateOnlySchema.optional(),
    checkOutDate: dateOnlySchema.optional(),
    occupantCount: z.number().int().min(1).max(10).optional(),
    purpose: z.string().trim().max(500).optional(),
    isEmergency: z.boolean().optional(),
    emergencyReason: z.string().trim().max(300).optional(),
    priority: z.enum(POLICY_PRIORITIES).optional(),
    hasRosterShift: z.boolean().optional(),
    availableBeds: z.number().int().min(0).max(100000).optional(),
    requestedBeds: z.number().int().min(0).max(100).optional(),
    employeeCategories: z.array(z.string()).max(20).optional(),
    employmentStatus: z.string().trim().max(40).optional(),
    eligibilityStatus: z.string().trim().max(40).optional(),
    earlyCheckInMinutes: z.number().int().min(0).max(1440).optional(),
    lateCheckOutMinutes: z.number().int().min(0).max(1440).optional(),
    cancellationNoticeHours: z.number().min(0).max(8760).optional(),
    sameDayCancellation: z.boolean().optional(),
    asOf: z.string().datetime().optional(),
  })
  .refine(
    (value) =>
      !value.checkInDate || !value.checkOutDate || value.checkOutDate > value.checkInDate,
    { path: ['checkOutDate'], message: 'Tanggal check-out harus setelah check-in.' },
  );

export type PolicySimulationInput = z.infer<typeof policySimulationSchema>;

export const policyListQuerySchema = createPaginationQuerySchema({
  pageSize: 20,
  maxPageSize: 100,
}).extend({
  category: z.enum(POLICY_CATEGORIES).optional(),
  status: z.enum(POLICY_STATUSES).optional(),
  effect: z.enum(POLICY_EFFECTS).optional(),
  dormitoryId: z.uuid().optional(),
});

export type PolicyListQuery = z.infer<typeof policyListQuerySchema>;

export const policyEvaluationListQuerySchema = createPaginationQuerySchema({
  pageSize: 25,
  maxPageSize: 100,
}).extend({
  policyId: z.uuid().optional(),
  workflow: z.enum(POLICY_WORKFLOWS).optional(),
  result: z.enum(POLICY_DECISIONS).optional(),
  simulated: z.enum(['true', 'false']).optional(),
  dormitoryId: z.uuid().optional(),
});

export type PolicyEvaluationListQuery = z.infer<typeof policyEvaluationListQuerySchema>;

export interface PolicySummary {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: PolicyCategory;
  effect: PolicyEffect;
  severity: PolicySeverity;
  priority: number;
  status: PolicyStatus;
  version: number;
  approved: boolean;
  approvedAt: string | null;
  dormitoryId: string | null;
  dormitoryCode: string | null;
  dormitoryName: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string | null;
  updatedByUserId: string | null;
}

export interface PolicyDetail extends PolicySummary {
  parameters: Record<string, unknown>;
  conditions: Record<string, unknown>;
}

export interface PolicyCounts {
  active: number;
  draft: number;
  inactive: number;
}

export interface PolicyListResult {
  items: PolicySummary[];
  counts: PolicyCounts;
  pagination: PaginationMeta;
}

export interface PolicyVersionEntry {
  id: string;
  version: number;
  code: string;
  name: string;
  category: PolicyCategory;
  effect: PolicyEffect;
  severity: PolicySeverity;
  priority: number;
  parameters: Record<string, unknown>;
  conditions: Record<string, unknown>;
  dormitoryId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: PolicyStatus;
  approvedAt: string | null;
  approvedByUserId: string | null;
  createdByUserId: string | null;
  changeNote: string | null;
  createdAt: string;
}

export interface PolicyEvaluationLine {
  policyId: string;
  policyCode: string;
  policyVersion: number;
  category: PolicyCategory;
  priority: number;
  effect: PolicyEffect;
  severity: PolicySeverity;
  result: PolicyDecision;
  matched: boolean;
  reason: string;
}

export interface PolicyEvaluationResult {
  decision: PolicyDecision;
  evaluatedAt: string;
  evaluations: PolicyEvaluationLine[];
  blockingPolicy: PolicyEvaluationLine | null;
  activePolicyCount: number;
}

export interface PolicyEvaluationLogEntry {
  id: string;
  policyId: string | null;
  policyCode: string;
  policyVersion: number;
  category: PolicyCategory;
  workflow: PolicyWorkflow;
  result: PolicyDecision;
  reason: string;
  matched: boolean;
  simulated: boolean;
  dormitoryId: string | null;
  dormitoryCode: string | null;
  subjectType: string | null;
  subjectId: string | null;
  actorUserId: string | null;
  actorName: string | null;
  evaluatedAt: string;
}

export interface PolicyEvaluationLogResult {
  items: PolicyEvaluationLogEntry[];
  pagination: PaginationMeta;
}

export interface PolicyDashboardSummary {
  counts: PolicyCounts;
  total: number;
  categoriesCovered: number;
  evaluationsLast7Days: number;
  deniedLast7Days: number;
}
