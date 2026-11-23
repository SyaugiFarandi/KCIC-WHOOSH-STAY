import { describe, expect, it } from 'vitest';
import { classifyBedStatus, occupancyRate } from './service.js';

describe('bed occupancy status classifier', () => {
  it('classifies available, reserved, occupied and cleaning beds', () => {
    expect(classifyBedStatus({ allocations: [], blockTypes: [], cleaning: false })).toBe(
      'AVAILABLE',
    );
    expect(
      classifyBedStatus({ allocations: [{ status: 'HELD' }], blockTypes: [], cleaning: false }),
    ).toBe('RESERVED');
    expect(
      classifyBedStatus({ allocations: [{ status: 'ACTIVE' }], blockTypes: [], cleaning: false }),
    ).toBe('OCCUPIED');
    expect(classifyBedStatus({ allocations: [], blockTypes: [], cleaning: true })).toBe(
      'CLEANING',
    );
  });

  it('applies precedence blocked > maintenance > occupied > reserved > cleaning', () => {
    expect(
      classifyBedStatus({
        allocations: [{ status: 'ACTIVE' }],
        blockTypes: ['OPERATIONAL'],
        cleaning: true,
      }),
    ).toBe('BLOCKED');
    expect(
      classifyBedStatus({
        allocations: [{ status: 'ACTIVE' }],
        blockTypes: ['MAINTENANCE'],
        cleaning: true,
      }),
    ).toBe('MAINTENANCE');
    expect(
      classifyBedStatus({
        allocations: [{ status: 'HELD' }, { status: 'ACTIVE' }],
        blockTypes: [],
        cleaning: true,
      }),
    ).toBe('OCCUPIED');
    expect(
      classifyBedStatus({
        allocations: [{ status: 'HELD' }],
        blockTypes: [],
        cleaning: true,
      }),
    ).toBe('RESERVED');
  });

  it('treats OTHER blocks as blocked inventory', () => {
    expect(
      classifyBedStatus({ allocations: [], blockTypes: ['OTHER'], cleaning: false }),
    ).toBe('BLOCKED');
  });
});

describe('occupancy rate', () => {
  it('returns null when capacity is zero and rounds to one decimal otherwise', () => {
    expect(occupancyRate(0, 0)).toBeNull();
    expect(occupancyRate(1, 3)).toBe(33.3);
    expect(occupancyRate(2, 3)).toBe(66.7);
    expect(occupancyRate(0, 5)).toBe(0);
  });
});
