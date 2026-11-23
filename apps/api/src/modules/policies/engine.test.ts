import { describe, expect, it } from 'vitest';
import type { PolicyCategory, PolicyEffect } from '@whoosh/shared';
import {
  aggregatePolicyDecision,
  buildPolicyViolationKey,
  evaluatePolicyAgainstContext,
  policiesConditionsMatch,
  policyIsEffective,
  type EvaluationPolicy,
  type PolicyEvaluationContext,
} from './engine.js';

let sequence = 0;

function policy(overrides: Partial<EvaluationPolicy> & { category: PolicyCategory }): EvaluationPolicy {
  sequence += 1;
  return {
    id: `policy-${sequence}`,
    code: `TEST_${sequence}`,
    name: `Policy ${sequence}`,
    effect: 'DENY' as PolicyEffect,
    severity: 'MEDIUM',
    priority: 100,
    version: 1,
    parameters: {},
    conditions: {},
    dormitoryId: null,
    effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
    effectiveTo: null,
    ...overrides,
  };
}

function context(overrides: Partial<PolicyEvaluationContext> = {}): PolicyEvaluationContext {
  return {
    workflow: 'RESERVATION_MANUAL',
    asOfDate: '2026-06-01',
    dormitoryId: '11111111-1111-1111-1111-111111111111',
    checkInDate: '2026-06-10',
    checkOutDate: '2026-06-13',
    nights: 3,
    occupantCount: 1,
    priority: 'NORMAL',
    ...overrides,
  };
}

describe('policy aggregate precedence', () => {
  it('returns ALLOWED when no policy is provided', () => {
    const result = aggregatePolicyDecision([], context());
    expect(result.decision).toBe('ALLOWED');
    expect(result.blockingPolicy).toBeNull();
    expect(result.activePolicyCount).toBe(0);
  });

  it('returns ALLOWED when no policy matches the context', () => {
    const result = aggregatePolicyDecision(
      [policy({ category: 'MAX_STAY_DURATION', parameters: { maxNights: 10 } })],
      context(),
    );
    expect(result.decision).toBe('ALLOWED');
    expect(result.evaluations[0]?.matched).toBe(false);
  });

  it('DENIED outranks REQUIRES_APPROVAL and REQUIRES_MANUAL_REVIEW regardless of priority', () => {
    const result = aggregatePolicyDecision(
      [
        policy({
          category: 'MAX_STAY_DURATION',
          effect: 'REQUIRES_APPROVAL',
          priority: 999,
          parameters: { maxNights: 1 },
        }),
        policy({
          category: 'BED_CAPACITY',
          effect: 'REQUIRES_MANUAL_REVIEW',
          priority: 500,
          parameters: { maxOccupantsPerReservation: 1 },
        }),
        policy({
          category: 'BOOKING_LEAD_TIME',
          effect: 'DENY',
          priority: 1,
          parameters: { minLeadDays: 30 },
        }),
      ],
      context(),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.blockingPolicy?.effect).toBe('DENY');
  });

  it('breaks same-result ties by priority descending, then policy code ascending', () => {
    const low = policy({
      code: 'AAA_LOW',
      category: 'MAX_STAY_DURATION',
      priority: 10,
      parameters: { maxNights: 1 },
    });
    const highA = policy({
      code: 'ZZZ_HIGH',
      category: 'MAX_STAY_DURATION',
      priority: 900,
      parameters: { maxNights: 2 },
    });
    const highB = policy({
      code: 'BBB_HIGH',
      category: 'BED_CAPACITY',
      priority: 900,
      parameters: { maxOccupantsPerReservation: 1 },
    });
    const result = aggregatePolicyDecision(
      [low, highA, highB],
      context({ occupantCount: 2 }),
    );
    expect(result.decision).toBe('DENIED');
    expect(result.blockingPolicy?.policyCode).toBe('BBB_HIGH');
  });

  it('carries policy id and version into every evaluation line', () => {
    const target = policy({
      category: 'BED_CAPACITY',
      version: 7,
      parameters: { maxOccupantsPerReservation: 1 },
    });
    const line = evaluatePolicyAgainstContext(target, context({ occupantCount: 2 }));
    expect(line).not.toBeNull();
    expect(line).toMatchObject({ policyId: target.id, policyVersion: 7, matched: true });
  });
});

describe('effective dates and scoping', () => {
  it('skips a policy before its effectiveFrom date and includes it on the start day', () => {
    const target = policy({
      category: 'BED_CAPACITY',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
      parameters: { maxOccupantsPerReservation: 1 },
    });
    expect(evaluatePolicyAgainstContext(target, context({ asOfDate: '2026-05-31' }))).toBeNull();
    expect(evaluatePolicyAgainstContext(target, context({ asOfDate: '2026-06-01' }))).not.toBeNull();
  });

  it('includes the effectiveTo date and excludes the next day', () => {
    const target = policy({
      category: 'BED_CAPACITY',
      effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
      effectiveTo: new Date('2026-06-30T00:00:00.000Z'),
      parameters: { maxOccupantsPerReservation: 1 },
    });
    expect(evaluatePolicyAgainstContext(target, context({ asOfDate: '2026-06-30' }))).not.toBeNull();
    expect(evaluatePolicyAgainstContext(target, context({ asOfDate: '2026-07-01' }))).toBeNull();
    expect(
      policyIsEffective(target, '2026-06-30'),
    ).toBe(true);
  });

  it('does not apply a dormitory-scoped policy to another dormitory', () => {
    const target = policy({
      category: 'BED_CAPACITY',
      dormitoryId: '22222222-2222-2222-2222-222222222222',
      parameters: { maxOccupantsPerReservation: 1 },
    });
    expect(evaluatePolicyAgainstContext(target, context())).toBeNull();
    expect(
      evaluatePolicyAgainstContext(
        target,
        context({ dormitoryId: '22222222-2222-2222-2222-222222222222' }),
      ),
    ).not.toBeNull();
  });

  it('matches only when every condition equals the context value', () => {
    const target = policy({
      category: 'BED_CAPACITY',
      conditions: { occupantCount: 2, priority: 'HIGH' },
      parameters: { maxOccupantsPerReservation: 1 },
    });
    expect(policiesConditionsMatch(target, context({ occupantCount: 2, priority: 'HIGH' }))).toBe(
      true,
    );
    expect(policiesConditionsMatch(target, context({ occupantCount: 2, priority: 'LOW' }))).toBe(
      false,
    );
    expect(evaluatePolicyAgainstContext(target, context({ occupantCount: 2 }))).toBeNull();
  });
});

describe('category evaluators', () => {
  function triggered(
    target: EvaluationPolicy,
    ctx: PolicyEvaluationContext = context(),
  ): boolean {
    return evaluatePolicyAgainstContext(target, ctx)?.matched === true;
  }

  it('RESERVATION_ELIGIBILITY denies ineligible or disallowed employment status', () => {
    const deniedEligibility = policy({
      category: 'RESERVATION_ELIGIBILITY',
      parameters: { deniedEligibilityStatuses: ['INELIGIBLE'] },
    });
    expect(
      triggered(deniedEligibility, context({ eligibilityStatus: 'INELIGIBLE' })),
    ).toBe(true);
    expect(triggered(deniedEligibility, context({ eligibilityStatus: 'ELIGIBLE' }))).toBe(false);

    const allowedEmployment = policy({
      category: 'RESERVATION_ELIGIBILITY',
      parameters: { allowedEmploymentStatuses: ['ACTIVE'] },
    });
    expect(triggered(allowedEmployment, context({ employmentStatus: 'INACTIVE' }))).toBe(true);
    expect(triggered(allowedEmployment, context({ employmentStatus: 'ACTIVE' }))).toBe(false);
  });

  it('CREW_CATEGORY requires matching department, division, and position lists', () => {
    const target = policy({
      category: 'CREW_CATEGORY',
      parameters: { allowedDepartments: ['OPS'], allowedPositions: ['ATTENDANT'] },
    });
    expect(
      triggered(target, context({ employeeCategories: ['dept:OPS', 'pos:ATTENDANT'] })),
    ).toBe(false);
    expect(triggered(target, context({ employeeCategories: ['dept:FIN', 'pos:ATTENDANT'] }))).toBe(
      true,
    );
  });

  it('MAX_STAY_DURATION and BED_CAPACITY compare numeric limits', () => {
    expect(
      triggered(
        policy({ category: 'MAX_STAY_DURATION', parameters: { maxNights: 2 } }),
        context({ nights: 3 }),
      ),
    ).toBe(true);
    expect(
      triggered(
        policy({ category: 'BED_CAPACITY', parameters: { maxOccupantsPerReservation: 4 } }),
        context({ occupantCount: 4 }),
      ),
    ).toBe(false);
  });

  it('BOOKING_LEAD_TIME enforces minimum and maximum lead days', () => {
    const minLead = policy({ category: 'BOOKING_LEAD_TIME', parameters: { minLeadDays: 30 } });
    expect(triggered(minLead)).toBe(true);

    const maxLead = policy({ category: 'BOOKING_LEAD_TIME', parameters: { maxLeadDays: 30 } });
    expect(triggered(maxLead, context({ checkInDate: '2026-08-01' }))).toBe(true);
    expect(triggered(maxLead)).toBe(false);
  });

  it('RESERVATION_PRIORITY and DORMITORY_ASSIGNMENT use list membership', () => {
    expect(
      triggered(
        policy({ category: 'RESERVATION_PRIORITY', parameters: { restrictedPriorities: ['HIGH'] } }),
        context({ priority: 'HIGH' }),
      ),
    ).toBe(true);
    expect(
      triggered(
        policy({
          category: 'DORMITORY_ASSIGNMENT',
          parameters: { allowedDormitoryIds: ['33333333-3333-3333-3333-333333333333'] },
        }),
      ),
    ).toBe(true);
  });

  it('ROOM_ALLOCATION enforces explicit beds and bed count limits', () => {
    expect(
      triggered(
        policy({ category: 'ROOM_ALLOCATION', parameters: { requireExplicitBed: true } }),
        context({ hasExplicitBeds: false, requestedBeds: 1 }),
      ),
    ).toBe(true);
    expect(
      triggered(
        policy({ category: 'ROOM_ALLOCATION', parameters: { maxBedsPerReservation: 2 } }),
        context({ requestedBeds: 3 }),
      ),
    ).toBe(true);
    expect(
      triggered(
        policy({ category: 'ROOM_ALLOCATION', parameters: { requireExplicitBed: true } }),
        context({ workflow: 'CHECK_IN', hasExplicitBeds: false }),
      ),
    ).toBe(false);
  });

  it('CHECK_IN_RULES and CHECK_OUT_RULES only trigger when the context flag is set', () => {
    const checkIn = policy({
      category: 'CHECK_IN_RULES',
      parameters: { allowBeforeScheduledDate: false },
    });
    expect(
      triggered(checkIn, context({ workflow: 'CHECK_IN', beforeScheduledDate: true })),
    ).toBe(true);
    expect(
      triggered(checkIn, context({ workflow: 'CHECK_IN', beforeScheduledDate: false })),
    ).toBe(false);

    const checkOut = policy({
      category: 'CHECK_OUT_RULES',
      parameters: { allowBeforeScheduledDate: false },
    });
    expect(
      triggered(checkOut, context({ workflow: 'CHECK_OUT', beforeScheduledCheckout: true })),
    ).toBe(true);
  });

  it('EARLY_CHECK_IN and LATE_CHECK_OUT compare minute limits', () => {
    expect(
      triggered(
        policy({ category: 'EARLY_CHECK_IN', parameters: { maxEarlyMinutes: 30 } }),
        context({ workflow: 'CHECK_IN', earlyCheckInMinutes: 45 }),
      ),
    ).toBe(true);
    expect(
      triggered(
        policy({ category: 'LATE_CHECK_OUT', parameters: { maxLateMinutes: 60 } }),
        context({ workflow: 'CHECK_OUT', lateCheckOutMinutes: 61 }),
      ),
    ).toBe(true);
  });

  it('CANCELLATION enforces same-day block and minimum notice', () => {
    expect(
      triggered(
        policy({
          category: 'CANCELLATION',
          parameters: { blockSameDayCancellation: true },
        }),
        context({ workflow: 'CANCELLATION', sameDayCancellation: true }),
      ),
    ).toBe(true);
    expect(
      triggered(
        policy({ category: 'CANCELLATION', parameters: { minNoticeHours: 24 } }),
        context({ workflow: 'CANCELLATION', cancellationNoticeHours: 2 }),
      ),
    ).toBe(true);
    expect(
      triggered(
        policy({ category: 'CANCELLATION', parameters: { minNoticeHours: 24 } }),
        context({ workflow: 'CANCELLATION', cancellationNoticeHours: 48 }),
      ),
    ).toBe(false);
  });

  it('EMERGENCY_RESERVATION ignores non-emergencies and only triggers on unmet parameters', () => {
    const target = policy({
      category: 'EMERGENCY_RESERVATION',
      parameters: { requireReason: true, allowedPriorities: ['EMERGENCY'] },
    });
    expect(evaluatePolicyAgainstContext(target, context({ isEmergency: false }))).toBeNull();
    expect(
      triggered(
        target,
        context({ isEmergency: true, emergencyReason: 'banjir', priority: 'EMERGENCY' }),
      ),
    ).toBe(false);
    expect(triggered(target, context({ isEmergency: true, emergencyReason: null }))).toBe(true);
    expect(
      triggered(
        target,
        context({ isEmergency: true, emergencyReason: 'ok', priority: 'HIGH' }),
      ),
    ).toBe(true);
  });

  it('ROSTER_DEPENDENCY requires the roster signal and honors it when present', () => {
    const target = policy({
      category: 'ROSTER_DEPENDENCY',
      parameters: { requireRosterShift: true },
    });
    expect(evaluatePolicyAgainstContext(target, context({ hasRosterShift: undefined }))).toBeNull();
    expect(triggered(target, context({ hasRosterShift: false }))).toBe(true);
    expect(triggered(target, context({ hasRosterShift: true }))).toBe(false);
  });

  it('OVERBOOKING_PREVENTION compares demand plus spare against availability', () => {
    const target = policy({
      category: 'OVERBOOKING_PREVENTION',
      parameters: { requiredSpareBeds: 1 },
    });
    expect(
      triggered(target, context({ availableBeds: 2, requestedBeds: 2 })),
    ).toBe(true);
    expect(
      triggered(target, context({ availableBeds: 3, requestedBeds: 2 })),
    ).toBe(false);

    const allowOverbooking = policy({
      category: 'OVERBOOKING_PREVENTION',
      parameters: { requiredSpareBeds: 5, allowOverbooking: true },
    });
    expect(
      triggered(allowOverbooking, context({ availableBeds: 0, requestedBeds: 1 })),
    ).toBe(false);
  });

  it('scopes each category to its workflow so unrelated flows stay ALLOWED', () => {
    const cancellation = policy({
      category: 'CANCELLATION',
      parameters: { minNoticeHours: 24 },
    });
    expect(evaluatePolicyAgainstContext(cancellation, context())).toBeNull();

    const checkIn = policy({
      category: 'CHECK_IN_RULES',
      parameters: { allowBeforeScheduledDate: false },
    });
    expect(evaluatePolicyAgainstContext(checkIn, context())).toBeNull();

    const cancellationBlanket = policy({ category: 'CANCELLATION' });
    expect(
      aggregatePolicyDecision(
        [cancellationBlanket],
        context({ workflow: 'CANCELLATION', sameDayCancellation: false }),
      ).decision,
    ).toBe('DENIED');
    expect(aggregatePolicyDecision([cancellationBlanket], context()).decision).toBe('ALLOWED');
  });

  it('applies a blanket policy (no parameters) to every applicable context', () => {
    const target = policy({ category: 'BED_CAPACITY', effect: 'REQUIRES_MANUAL_REVIEW' });
    const result = aggregatePolicyDecision([target], context({ occupantCount: 1 }));
    expect(result.decision).toBe('REQUIRES_MANUAL_REVIEW');
  });
});

describe('policy violation dedupe key', () => {
  it('is stable for the same subject and bounded to the column limit', () => {
    const key = buildPolicyViolationKey({
      policyCode: 'MAX_NIGHTS',
      workflow: 'RESERVATION_MANUAL',
      dormitoryId: '11111111-1111-1111-1111-111111111111',
      subjectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    });
    expect(key).toBe(
      buildPolicyViolationKey({
        policyCode: 'MAX_NIGHTS',
        workflow: 'RESERVATION_MANUAL',
        dormitoryId: '11111111-1111-1111-1111-111111111111',
        subjectId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      }),
    );
    expect(key.length).toBeLessThanOrEqual(200);
  });

  it('falls back to date ranges when there is no subject yet', () => {
    const key = buildPolicyViolationKey({
      policyCode: 'MAX_NIGHTS',
      workflow: 'RESERVATION_MANUAL',
      dormitoryId: '11111111-1111-1111-1111-111111111111',
      checkInDate: '2026-12-01',
      checkOutDate: '2026-12-03',
    });
    expect(key).toContain('2026-12-01:2026-12-03');
  });
});
