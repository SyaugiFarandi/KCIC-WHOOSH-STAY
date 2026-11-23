import { describe, expect, it } from 'vitest';
import { paginationQuerySchema, assignRolesSchema } from '@whoosh/shared';

describe('paginationQuerySchema', () => {
  it('applies defaults and coerces numeric strings', () => {
    const parsed = paginationQuerySchema.parse({});
    expect(parsed).toMatchObject({ page: 1, pageSize: 15 });

    const coerced = paginationQuerySchema.parse({ page: '2', pageSize: '50' });
    expect(coerced.page).toBe(2);
    expect(coerced.pageSize).toBe(50);
  });

  it('rejects page sizes above 100', () => {
    expect(paginationQuerySchema.safeParse({ pageSize: '101' }).success).toBe(false);
  });
});

describe('assignRolesSchema', () => {
  it('accepts a valid global assignment', () => {
    expect(
      assignRolesSchema.safeParse({
        assignments: [{ roleCode: 'SYSTEM_ADMIN', scopeType: 'GLOBAL', scopeId: null }],
      }).success,
    ).toBe(true);
  });

  it('rejects scope ids on GLOBAL scope', () => {
    expect(
      assignRolesSchema.safeParse({
        assignments: [
          {
            roleCode: 'AUDITOR',
            scopeType: 'GLOBAL',
            scopeId: '00000000-0000-0000-0000-000000000001',
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('requires scope ids for DORMITORY scope', () => {
    expect(
      assignRolesSchema.safeParse({
        assignments: [{ roleCode: 'DORMITORY_ADMIN', scopeType: 'DORMITORY' }],
      }).success,
    ).toBe(false);
  });

  it('rejects duplicate assignments', () => {
    expect(
      assignRolesSchema.safeParse({
        assignments: [
          { roleCode: 'CREW', scopeType: 'SELF' },
          { roleCode: 'CREW', scopeType: 'SELF' },
        ],
      }).success,
    ).toBe(false);
  });
});
