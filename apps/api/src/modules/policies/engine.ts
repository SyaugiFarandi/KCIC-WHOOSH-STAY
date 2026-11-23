import {
  POLICY_DECISION_PRECEDENCE,
  POLICY_EFFECT_RESULTS,
  type PolicyCategory,
  type PolicyDecision,
  type PolicyEffect,
  type PolicyEvaluationLine,
  type PolicyEvaluationResult,
  type PolicyPriority,
  type PolicySeverity,
  type PolicyWorkflow,
} from '@whoosh/shared';

export interface EvaluationPolicy {
  id: string;
  code: string;
  name: string;
  category: PolicyCategory;
  effect: PolicyEffect;
  severity: PolicySeverity;
  priority: number;
  version: number;
  parameters: Record<string, unknown>;
  conditions: Record<string, unknown>;
  dormitoryId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface PolicyEvaluationContext {
  workflow: PolicyWorkflow;
  asOfDate: string;
  dormitoryId?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
  nights?: number | null;
  occupantCount?: number | null;
  purpose?: string | null;
  isEmergency?: boolean;
  emergencyReason?: string | null;
  priority?: PolicyPriority | string | null;
  hasRosterShift?: boolean;
  availableBeds?: number;
  requestedBeds?: number;
  hasExplicitBeds?: boolean;
  employeeCategories?: string[];
  employmentStatus?: string | null;
  eligibilityStatus?: string | null;
  earlyCheckInMinutes?: number;
  lateCheckOutMinutes?: number;
  beforeScheduledDate?: boolean;
  beforeScheduledCheckout?: boolean;
  cancellationNoticeHours?: number;
  sameDayCancellation?: boolean;
  subjectType?: string;
  subjectId?: string | null;
  actorUserId?: string | null;
  requestId?: string | null;
}

interface CategoryRuleResult {
  applicable: boolean;
  triggered: boolean;
  reason: string;
}

function numberParam(policy: EvaluationPolicy, key: string): number | undefined {
  const value = policy.parameters[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function booleanParam(policy: EvaluationPolicy, key: string): boolean | undefined {
  const value = policy.parameters[key];
  return typeof value === 'boolean' ? value : undefined;
}

function stringArrayParam(policy: EvaluationPolicy, key: string): string[] | undefined {
  const value = policy.parameters[key];
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? (value as string[])
    : undefined;
}

const RESERVATION_WORKFLOWS: PolicyWorkflow[] = [
  'RESERVATION_AUTO',
  'RESERVATION_MANUAL',
  'EMERGENCY_RESERVATION',
];

const ALLOCATION_WORKFLOWS: PolicyWorkflow[] = [
  ...RESERVATION_WORKFLOWS,
  'ROOM_ALLOCATION',
  'BED_ALLOCATION',
];

const CATEGORY_WORKFLOWS: Record<PolicyCategory, PolicyWorkflow[]> = {
  RESERVATION_ELIGIBILITY: RESERVATION_WORKFLOWS,
  CREW_CATEGORY: RESERVATION_WORKFLOWS,
  MAX_STAY_DURATION: RESERVATION_WORKFLOWS,
  BOOKING_LEAD_TIME: RESERVATION_WORKFLOWS,
  RESERVATION_PRIORITY: RESERVATION_WORKFLOWS,
  DORMITORY_ASSIGNMENT: ALLOCATION_WORKFLOWS,
  ROOM_ALLOCATION: ALLOCATION_WORKFLOWS,
  BED_CAPACITY: ALLOCATION_WORKFLOWS,
  CHECK_IN_RULES: ['CHECK_IN'],
  CHECK_OUT_RULES: ['CHECK_OUT'],
  EARLY_CHECK_IN: ['CHECK_IN'],
  LATE_CHECK_OUT: ['CHECK_OUT'],
  CANCELLATION: ['CANCELLATION'],
  EMERGENCY_RESERVATION: RESERVATION_WORKFLOWS,
  ROSTER_DEPENDENCY: RESERVATION_WORKFLOWS,
  OVERBOOKING_PREVENTION: ALLOCATION_WORKFLOWS,
};

function notApplicable(reason: string): CategoryRuleResult {
  return { applicable: false, triggered: false, reason };
}

function rule(reason: string): CategoryRuleResult {
  return { applicable: true, triggered: true, reason };
}

function noViolation(reason: string): CategoryRuleResult {
  return { applicable: true, triggered: false, reason };
}

function blanket(policy: EvaluationPolicy): CategoryRuleResult {
  return rule(`Kebijakan ${policy.code} tidak memiliki parameter; efek berlaku untuk semua konteks.`);
}

function isBlanket(policy: EvaluationPolicy): boolean {
  return Object.keys(policy.parameters).length === 0;
}

function evaluateCategory(
  policy: EvaluationPolicy,
  context: PolicyEvaluationContext,
): CategoryRuleResult {
  if (!CATEGORY_WORKFLOWS[policy.category].includes(context.workflow)) {
    return notApplicable('Kategori kebijakan ini tidak berlaku pada workflow tersebut.');
  }
  switch (policy.category) {
    case 'RESERVATION_ELIGIBILITY': {
      if (isBlanket(policy)) return blanket(policy);
      if (context.employmentStatus === undefined && context.eligibilityStatus === undefined) {
        return notApplicable('Data kepegawaian tidak tersedia pada konteks ini.');
      }
      const denied = stringArrayParam(policy, 'deniedEligibilityStatuses') ?? [];
      if (context.eligibilityStatus && denied.includes(context.eligibilityStatus)) {
        return rule(`Status eligibilitas ${context.eligibilityStatus} termasuk daftar terlarang.`);
      }
      const allowed = stringArrayParam(policy, 'allowedEmploymentStatuses') ?? [];
      if (allowed.length) {
        if (!context.employmentStatus) {
          return notApplicable('Status kepegawaian tidak tersedia untuk dibandingkan.');
        }
        if (!allowed.includes(context.employmentStatus)) {
          return rule(`Status kepegawaian ${context.employmentStatus} tidak diizinkan.`);
        }
      }
      return noViolation('Status kepegawaian memenuhi kebijakan.');
    }

    case 'CREW_CATEGORY': {
      if (isBlanket(policy)) return blanket(policy);
      const categories = context.employeeCategories ?? [];
      if (!categories.length) {
        return notApplicable('Kategori kru tidak tersedia pada konteks ini.');
      }
      const dimensions: Array<[string, string]> = [
        ['allowedDepartments', 'dept'],
        ['allowedDivisions', 'div'],
        ['allowedPositions', 'pos'],
      ];
      for (const [key, prefix] of dimensions) {
        const allowedValues = stringArrayParam(policy, key) ?? [];
        if (!allowedValues.length) continue;
        const hasMatch = categories.some(
          (category) =>
            category.startsWith(`${prefix}:`) && allowedValues.includes(category.slice(prefix.length + 1)),
        );
        if (!hasMatch) {
          return rule(`Kategori kru tidak memenuhi daftar ${key}.`);
        }
      }
      return noViolation('Kategori kru memenuhi kebijakan.');
    }

    case 'MAX_STAY_DURATION': {
      if (isBlanket(policy)) return blanket(policy);
      const maxNights = numberParam(policy, 'maxNights');
      if (maxNights === undefined) return notApplicable('Parameter maxNights tidak ditetapkan.');
      if (context.nights === undefined || context.nights === null) {
        return notApplicable('Durasi menginap tidak tersedia pada konteks ini.');
      }
      if (context.nights > maxNights) {
        return rule(`Durasi ${context.nights} malam melebihi maksimum ${maxNights} malam.`);
      }
      return noViolation(`Durasi ${context.nights} malam dalam batas ${maxNights} malam.`);
    }

    case 'BOOKING_LEAD_TIME': {
      if (isBlanket(policy)) return blanket(policy);
      if (!context.checkInDate) return notApplicable('Tanggal check-in tidak tersedia.');
      const leadDays = Math.round(
        (Date.parse(`${context.checkInDate}T00:00:00Z`) -
          Date.parse(`${context.asOfDate}T00:00:00Z`)) /
          86_400_000,
      );
      const minLead = numberParam(policy, 'minLeadDays');
      const maxLead = numberParam(policy, 'maxLeadDays');
      if (minLead !== undefined && leadDays < minLead) {
        return rule(`Pemesanan ${leadDays} hari sebelum check-in, minimum ${minLead} hari.`);
      }
      if (maxLead !== undefined && leadDays > maxLead) {
        return rule(`Pemesanan ${leadDays} hari sebelum check-in, maksimum ${maxLead} hari.`);
      }
      return noViolation(`Jarak pemesanan ${leadDays} hari dalam batas kebijakan.`);
    }

    case 'RESERVATION_PRIORITY': {
      if (isBlanket(policy)) return blanket(policy);
      const restricted = stringArrayParam(policy, 'restrictedPriorities') ?? [];
      if (!restricted.length) return noViolation('Tidak ada prioritas yang dibatasi.');
      if (!context.priority) return notApplicable('Prioritas reservasi tidak tersedia.');
      if (restricted.includes(context.priority)) {
        return rule(`Prioritas ${context.priority} termasuk kategori yang dibatasi.`);
      }
      return noViolation(`Prioritas ${context.priority} tidak dibatasi.`);
    }

    case 'DORMITORY_ASSIGNMENT': {
      if (isBlanket(policy)) return blanket(policy);
      const allowed = stringArrayParam(policy, 'allowedDormitoryIds') ?? [];
      if (!allowed.length) return noViolation('Tidak ada dormitory yang dibatasi.');
      if (!context.dormitoryId) return notApplicable('Dormitory tidak tersedia pada konteks ini.');
      if (!allowed.includes(context.dormitoryId)) {
        return rule('Dormitory yang diminta tidak termasuk daftar yang diizinkan.');
      }
      return noViolation('Dormitory termasuk daftar yang diizinkan.');
    }

    case 'ROOM_ALLOCATION': {
      if (isBlanket(policy)) return blanket(policy);
      const requireExplicit = booleanParam(policy, 'requireExplicitBed');
      if (requireExplicit === true) {
        const requested = context.requestedBeds ?? 0;
        const explicit = context.hasExplicitBeds ?? requested > 0;
        if (!explicit) {
          return rule('Kebijakan mewajibkan pemilihan tempat tidur eksplisit.');
        }
      }
      const maxBeds = numberParam(policy, 'maxBedsPerReservation');
      if (maxBeds !== undefined && (context.requestedBeds ?? 0) > maxBeds) {
        return rule(`Jumlah tempat tidur ${context.requestedBeds} melebihi maksimum ${maxBeds}.`);
      }
      return noViolation('Alokasi kamar sesuai kebijakan.');
    }

    case 'BED_CAPACITY': {
      if (isBlanket(policy)) return blanket(policy);
      const maxOccupants = numberParam(policy, 'maxOccupantsPerReservation');
      if (maxOccupants === undefined) {
        return notApplicable('Parameter maxOccupantsPerReservation tidak ditetapkan.');
      }
      if (context.occupantCount === undefined || context.occupantCount === null) {
        return notApplicable('Jumlah penghuni tidak tersedia pada konteks ini.');
      }
      if (context.occupantCount > maxOccupants) {
        return rule(`Jumlah penghuni ${context.occupantCount} melebihi maksimum ${maxOccupants}.`);
      }
      return noViolation(`Jumlah penghuni ${context.occupantCount} dalam batas.`);
    }

    case 'CHECK_IN_RULES': {
      if (isBlanket(policy)) return blanket(policy);
      const allowBefore = booleanParam(policy, 'allowBeforeScheduledDate');
      if (allowBefore === false && context.beforeScheduledDate) {
        return rule('Check-in sebelum tanggal reservasi tidak diizinkan.');
      }
      return noViolation('Aturan tambahan check-in terpenuhi.');
    }

    case 'CHECK_OUT_RULES': {
      if (isBlanket(policy)) return blanket(policy);
      const allowBefore = booleanParam(policy, 'allowBeforeScheduledDate');
      if (allowBefore === false && context.beforeScheduledCheckout) {
        return rule('Check-out sebelum tanggal selesai tidak diizinkan.');
      }
      return noViolation('Aturan tambahan check-out terpenuhi.');
    }

    case 'EARLY_CHECK_IN': {
      if (isBlanket(policy)) return blanket(policy);
      const maxEarly = numberParam(policy, 'maxEarlyMinutes');
      if (maxEarly === undefined) return notApplicable('Parameter maxEarlyMinutes tidak ditetapkan.');
      if (context.earlyCheckInMinutes === undefined) {
        return notApplicable('Waktu check-in lebih awal tidak tersedia.');
      }
      if (context.earlyCheckInMinutes > maxEarly) {
        return rule(
          `Check-in ${context.earlyCheckInMinutes} menit lebih awal melebihi batas ${maxEarly} menit.`,
        );
      }
      return noViolation('Check-in lebih awal dalam batas kebijakan.');
    }

    case 'LATE_CHECK_OUT': {
      if (isBlanket(policy)) return blanket(policy);
      const maxLate = numberParam(policy, 'maxLateMinutes');
      if (maxLate === undefined) return notApplicable('Parameter maxLateMinutes tidak ditetapkan.');
      if (context.lateCheckOutMinutes === undefined) {
        return notApplicable('Waktu check-out terlambat tidak tersedia.');
      }
      if (context.lateCheckOutMinutes > maxLate) {
        return rule(
          `Check-out ${context.lateCheckOutMinutes} menit terlambat melebihi batas ${maxLate} menit.`,
        );
      }
      return noViolation('Check-out terlambat dalam batas kebijakan.');
    }

    case 'CANCELLATION': {
      if (isBlanket(policy)) return blanket(policy);
      if (booleanParam(policy, 'blockSameDayCancellation') === true && context.sameDayCancellation) {
        return rule('Pembatalan pada tanggal check-in diblokir.');
      }
      const minNotice = numberParam(policy, 'minNoticeHours');
      if (
        minNotice !== undefined &&
        minNotice > 0 &&
        context.cancellationNoticeHours !== undefined &&
        context.cancellationNoticeHours < minNotice
      ) {
        return rule(
          `Pemberitahuan ${context.cancellationNoticeHours} jam kurang dari minimum ${minNotice} jam.`,
        );
      }
      return noViolation('Pembatalan memenuhi kebijakan.');
    }

    case 'EMERGENCY_RESERVATION': {
      if (context.isEmergency !== true) {
        return notApplicable('Bukan reservasi darurat.');
      }
      if (isBlanket(policy)) {
        return rule('Reservasi darurat dikenai kebijakan khusus.');
      }
      const issues: string[] = [];
      if (booleanParam(policy, 'requireReason') === true && !context.emergencyReason) {
        issues.push('alasan darurat wajib diisi');
      }
      const allowedPriorities = stringArrayParam(policy, 'allowedPriorities') ?? [];
      if (
        allowedPriorities.length &&
        context.priority &&
        !allowedPriorities.includes(context.priority)
      ) {
        issues.push(`prioritas ${context.priority} tidak diizinkan untuk darurat`);
      }
      if (issues.length) return rule(`Reservasi darurat: ${issues.join('; ')}.`);
      return noViolation('Reservasi darurat memenuhi parameter kebijakan.');
    }

    case 'ROSTER_DEPENDENCY': {
      if (isBlanket(policy)) return blanket(policy);
      if (context.hasRosterShift === undefined) {
        return notApplicable('Sinyal roster tidak tersedia pada workflow ini.');
      }
      if (booleanParam(policy, 'requireRosterShift') === true && !context.hasRosterShift) {
        return rule('Karyawan tidak memiliki shift roster yang mendukung reservasi.');
      }
      return noViolation('Sinyal roster memenuhi kebijakan.');
    }

    case 'OVERBOOKING_PREVENTION': {
      if (isBlanket(policy)) return blanket(policy);
      if (context.availableBeds === undefined || context.requestedBeds === undefined) {
        return notApplicable('Ketersediaan tempat tidur tidak tersedia pada konteks ini.');
      }
      if (booleanParam(policy, 'allowOverbooking') === true) {
        return noViolation('Overbooking diizinkan oleh parameter kebijakan.');
      }
      const spare = numberParam(policy, 'requiredSpareBeds') ?? 0;
      const needed = context.requestedBeds + spare;
      if (needed > context.availableBeds) {
        return rule(
          `Permintaan ${context.requestedBeds} bed + cadangan ${spare} melebihi ketersediaan ${context.availableBeds}.`,
        );
      }
      return noViolation(
        `Ketersediaan ${context.availableBeds} bed mencukupi permintaan dan cadangan.`,
      );
    }

    default: {
      const exhaustive: never = policy.category;
      return notApplicable(`Kategori ${String(exhaustive)} belum memiliki evaluator.`);
    }
  }
}

export function policiesConditionsMatch(
  policy: EvaluationPolicy,
  context: PolicyEvaluationContext,
): boolean {
  const entries = Object.entries(policy.conditions ?? {});
  if (!entries.length) return true;
  return entries.every(([key, expected]) => {
    const actual = (context as unknown as Record<string, unknown>)[key];
    return actual !== undefined && actual === expected;
  });
}

export function policyIsEffective(policy: EvaluationPolicy, asOfDate: string): boolean {
  const from = policy.effectiveFrom.toISOString().slice(0, 10);
  const to = policy.effectiveTo?.toISOString().slice(0, 10) ?? null;
  return from <= asOfDate && (!to || asOfDate <= to);
}

export function evaluatePolicyAgainstContext(
  policy: EvaluationPolicy,
  context: PolicyEvaluationContext,
  options: { ignoreEffectiveDate?: boolean } = {},
): PolicyEvaluationLine | null {
  if (!options.ignoreEffectiveDate && !policyIsEffective(policy, context.asOfDate)) return null;
  if (policy.dormitoryId && policy.dormitoryId !== context.dormitoryId) return null;
  if (!policiesConditionsMatch(policy, context)) return null;

  const outcome = evaluateCategory(policy, context);
  if (!outcome.applicable) return null;

  return {
    policyId: policy.id,
    policyCode: policy.code,
    policyVersion: policy.version,
    category: policy.category,
    priority: policy.priority,
    effect: policy.effect,
    severity: policy.severity,
    result: POLICY_EFFECT_RESULTS[policy.effect],
    matched: outcome.triggered,
    reason: outcome.reason,
  };
}

export function aggregatePolicyDecision(
  policies: EvaluationPolicy[],
  context: PolicyEvaluationContext,
  options: { now?: Date; ignoreEffectiveDate?: boolean } = {},
): PolicyEvaluationResult {
  const now = options.now ?? new Date();
  const evaluations: PolicyEvaluationLine[] = [];
  for (const policy of policies) {
    const line = evaluatePolicyAgainstContext(policy, context, {
      ignoreEffectiveDate: options.ignoreEffectiveDate,
    });
    if (line) evaluations.push(line);
  }

  const triggered = evaluations.filter((line) => line.matched);
  triggered.sort((a, b) => {
    const precedence =
      POLICY_DECISION_PRECEDENCE[b.result] - POLICY_DECISION_PRECEDENCE[a.result];
    if (precedence !== 0) return precedence;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.policyCode.localeCompare(b.policyCode);
  });

  const primary = triggered[0] ?? null;
  const decision: PolicyDecision = primary ? primary.result : 'ALLOWED';
  const blockingPolicy =
    primary && primary.result !== 'ALLOWED'
      ? primary
      : null;

  evaluations.sort((a, b) => {
    if (a.matched !== b.matched) return a.matched ? -1 : 1;
    const precedence =
      POLICY_DECISION_PRECEDENCE[b.result] - POLICY_DECISION_PRECEDENCE[a.result];
    if (precedence !== 0) return precedence;
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.policyCode.localeCompare(b.policyCode);
  });

  return {
    decision,
    evaluatedAt: now.toISOString(),
    evaluations,
    blockingPolicy,
    activePolicyCount: policies.length,
  };
}

export function buildPolicyViolationKey(input: {
  policyCode: string;
  workflow: PolicyWorkflow;
  dormitoryId: string;
  subjectId?: string | null;
  checkInDate?: string | null;
  checkOutDate?: string | null;
}): string {
  const subject =
    input.subjectId ?? `${input.checkInDate ?? 'na'}:${input.checkOutDate ?? 'na'}`;
  return `POLICY_VIOLATION:${input.policyCode}:${input.workflow}:${input.dormitoryId}:${subject}`.slice(
    0,
    200,
  );
}
