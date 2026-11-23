import { describe, expect, it } from 'vitest';
import {
  reservationExceptionAssignSchema,
  reservationExceptionResolveSchema,
} from '@whoosh/shared';
import { allocationConflictKey, overbookingKey } from './service.js';

describe('reservation exception dedupe keys', () => {
  it('treats the same bed set as one conflict regardless of order', () => {
    const first = allocationConflictKey('dorm-1', '2026-12-01', '2026-12-03', ['bed-a', 'bed-b']);
    const second = allocationConflictKey('dorm-1', '2026-12-01', '2026-12-03', ['bed-b', 'bed-a']);
    expect(first).toBe(second);
  });

  it('separates different dates, dormitories and bed sets', () => {
    const base = allocationConflictKey('dorm-1', '2026-12-01', '2026-12-03', ['bed-a']);
    expect(allocationConflictKey('dorm-1', '2026-12-02', '2026-12-03', ['bed-a'])).not.toBe(base);
    expect(allocationConflictKey('dorm-2', '2026-12-01', '2026-12-03', ['bed-a'])).not.toBe(base);
    expect(allocationConflictKey('dorm-1', '2026-12-01', '2026-12-03', ['bed-b'])).not.toBe(base);
  });

  it('builds a stable overbooking key scoped to dormitory, dates and demand', () => {
    expect(overbookingKey('dorm-1', '2026-12-01', '2026-12-03', 4)).toBe(
      'OVERBOOKING:dorm-1:2026-12-01:2026-12-03:4',
    );
  });

  it('keeps every dedupe key within the database column limit', () => {
    const longBedSet = Array.from({ length: 14 }, (_, index) => `bed-${index}`);
    const key = allocationConflictKey(
      '11111111-1111-1111-1111-111111111111',
      '2026-12-01',
      '2026-12-03',
      longBedSet,
    );
    expect(key.length).toBeLessThanOrEqual(200);
  });
});

describe('reservation exception action schemas', () => {
  it('requires exactly one assignment target', () => {
    expect(reservationExceptionAssignSchema.safeParse({ assignToSelf: true }).success).toBe(true);
    expect(
      reservationExceptionAssignSchema.safeParse({ assignedToUserId: null }).success,
    ).toBe(true);
    expect(reservationExceptionAssignSchema.safeParse({}).success).toBe(false);
    expect(
      reservationExceptionAssignSchema.safeParse({
        assignToSelf: true,
        assignedToUserId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(false);
  });

  it('requires a resolution note of at least three characters', () => {
    expect(
      reservationExceptionResolveSchema.safeParse({ status: 'RESOLVED', resolutionNote: 'ok' })
        .success,
    ).toBe(false);
    expect(
      reservationExceptionResolveSchema.safeParse({
        status: 'RESOLVED',
        resolutionNote: 'Alokasi ulang selesai',
      }).success,
    ).toBe(true);
    expect(
      reservationExceptionResolveSchema.safeParse({
        status: 'OPEN',
        resolutionNote: 'Alokasi ulang selesai',
      }).success,
    ).toBe(false);
  });
});
