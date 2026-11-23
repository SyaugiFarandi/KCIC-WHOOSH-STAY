import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@whoosh/shared';
import {
  hasAnyPermission,
  hasPermission,
  hasRole,
  resolveAccessScope,
  scopeIsEmpty,
  type Principal,
} from './types.js';

function principal(overrides: Partial<Principal> = {}): Principal {
  return {
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      email: 'user@example.test',
      displayName: 'Test User',
      status: 'ACTIVE',
      employeeId: null,
      employeeName: null,
    },
    roles: [],
    permissions: [],
    session: { id: 'session', expiresAt: new Date('2030-01-01T00:00:00.000Z') },
    ...overrides,
  };
}

describe('principal permission helpers', () => {
  it('checks effective permissions', () => {
    const user = principal({ permissions: [PERMISSIONS.roomsRead] });
    expect(hasPermission(user, PERMISSIONS.roomsRead)).toBe(true);
    expect(hasPermission(user, PERMISSIONS.roomsCreate)).toBe(false);
  });

  it('checks any-of permission sets', () => {
    const user = principal({ permissions: [PERMISSIONS.reportsRead] });
    expect(hasAnyPermission(user, [PERMISSIONS.reportsExport, PERMISSIONS.reportsRead])).toBe(true);
    expect(hasAnyPermission(user, [PERMISSIONS.auditRead])).toBe(false);
  });

  it('checks roles', () => {
    const user = principal({
      roles: [
        {
          roleCode: 'CREW',
          scopeType: 'SELF',
          scopeId: null,
          permissions: [PERMISSIONS.reservationsRead],
        },
      ],
    });
    expect(hasRole(user, 'CREW')).toBe(true);
    expect(hasRole(user, 'AUDITOR', 'SYSTEM_ADMIN')).toBe(false);
  });
});

describe('resolveAccessScope', () => {
  it('marks a GLOBAL role as global', () => {
    const scope = resolveAccessScope(
      principal({
        roles: [
          {
            roleCode: 'AUDITOR',
            scopeType: 'GLOBAL',
            scopeId: null,
            permissions: [PERMISSIONS.auditRead],
          },
        ],
      }),
    );
    expect(scope.global).toBe(true);
    expect(scopeIsEmpty(scope)).toBe(false);
  });

  it('collects and de-duplicates dormitory scope ids', () => {
    const scope = resolveAccessScope(
      principal({
        roles: [
          {
            roleCode: 'DORMITORY_ADMIN',
            scopeType: 'DORMITORY',
            scopeId: 'dorm-a',
            permissions: [PERMISSIONS.roomsRead],
          },
          {
            roleCode: 'FRONT_DESK',
            scopeType: 'DORMITORY',
            scopeId: 'dorm-a',
            permissions: [PERMISSIONS.roomsRead],
          },
          {
            roleCode: 'HOUSEKEEPING',
            scopeType: 'DORMITORY',
            scopeId: 'dorm-b',
            permissions: [PERMISSIONS.roomsRead],
          },
        ],
      }),
    );
    expect(scope.dormitoryIds).toEqual(['dorm-a', 'dorm-b']);
    expect(scope.global).toBe(false);
  });

  it('ignores roles that do not grant the requested permission', () => {
    const scope = resolveAccessScope(
      principal({
        roles: [
          {
            roleCode: 'CREW',
            scopeType: 'SELF',
            scopeId: null,
            permissions: [PERMISSIONS.reservationsRead],
          },
          {
            roleCode: 'AUDITOR',
            scopeType: 'GLOBAL',
            scopeId: null,
            permissions: [PERMISSIONS.auditRead],
          },
        ],
      }),
      PERMISSIONS.auditRead,
    );
    expect(scope.global).toBe(true);
    expect(scope.selfOnly).toBe(false);
  });

  it('records SELF and ASSIGNED_TASK scopes', () => {
    const scope = resolveAccessScope(
      principal({
        roles: [
          {
            roleCode: 'CREW',
            scopeType: 'SELF',
            scopeId: null,
            permissions: [PERMISSIONS.reservationsRead],
          },
          {
            roleCode: 'HOUSEKEEPING',
            scopeType: 'ASSIGNED_TASK',
            scopeId: null,
            permissions: [PERMISSIONS.housekeepingRead],
          },
        ],
      }),
    );
    expect(scope.selfOnly).toBe(true);
    expect(scope.assignedTaskOnly).toBe(true);
  });

  it('treats a role with an empty scope as empty', () => {
    const scope = resolveAccessScope(
      principal({
        roles: [
          {
            roleCode: 'DORMITORY_ADMIN',
            scopeType: 'DORMITORY',
            scopeId: null,
            permissions: [PERMISSIONS.roomsRead],
          },
        ],
      }),
    );
    expect(scopeIsEmpty(scope)).toBe(true);
  });
});
