import { describe, expect, it } from 'vitest';
import {
  PERMISSIONS,
  ROLE_CODES,
  type PermissionCode,
  type RoleCode,
} from '@whoosh/shared';
import { ROLE_PERMISSIONS } from './seed.js';

describe('seed role bundles', () => {
  it('covers every role exactly', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLE_CODES].sort());
  });

  it('only references catalog permission codes without duplicates', () => {
    const allowed = new Set<PermissionCode>(Object.values(PERMISSIONS));
    for (const role of ROLE_CODES) {
      const bundle = ROLE_PERMISSIONS[role];
      expect(new Set(bundle).size).toBe(bundle.length);
      for (const code of bundle) {
        expect(allowed.has(code)).toBe(true);
      }
    }
  });

  it('keeps SYSTEM_ADMIN as the full permission bundle', () => {
    expect([...ROLE_PERMISSIONS.SYSTEM_ADMIN].sort()).toEqual(
      Object.values(PERMISSIONS).sort(),
    );
  });

  it('keeps crew away from administrative and approval capabilities', () => {
    const crew = new Set<PermissionCode>(ROLE_PERMISSIONS.CREW);
    expect(crew.has(PERMISSIONS.reservationsApprove)).toBe(false);
    expect(crew.has(PERMISSIONS.allocationsExecute)).toBe(false);
    expect(crew.has(PERMISSIONS.usersManage)).toBe(false);
    expect(crew.has(PERMISSIONS.auditRead)).toBe(false);
    expect(crew.has(PERMISSIONS.reservationsCreate)).toBe(true);
  });

  it('keeps housekeeping away from reservation approval', () => {
    const housekeeping = new Set<PermissionCode>(ROLE_PERMISSIONS.HOUSEKEEPING);
    expect(housekeeping.has(PERMISSIONS.housekeepingExecute)).toBe(true);
    expect(housekeeping.has(PERMISSIONS.reservationsApprove)).toBe(false);
    expect(housekeeping.has(PERMISSIONS.allocationsExecute)).toBe(false);
  });

  it('keeps auditor read-only', () => {
    const auditor = new Set<PermissionCode>(ROLE_PERMISSIONS.AUDITOR);
    expect(auditor.has(PERMISSIONS.auditRead)).toBe(true);
    expect(auditor.has(PERMISSIONS.usersRead)).toBe(true);
    expect(auditor.has(PERMISSIONS.usersManage)).toBe(false);
    expect(auditor.has(PERMISSIONS.reservationsApprove)).toBe(false);
    expect(auditor.has(PERMISSIONS.maintenanceCreate)).toBe(false);
    expect(auditor.has(PERMISSIONS.staysCheckIn)).toBe(false);
  });
});

describe('role code typing', () => {
  it('contains the eight documented roles', () => {
    const expected: RoleCode[] = [
      'SYSTEM_ADMIN',
      'DORMITORY_MANAGER',
      'DORMITORY_ADMIN',
      'FRONT_DESK',
      'HOUSEKEEPING',
      'MAINTENANCE',
      'CREW',
      'AUDITOR',
    ];
    expect([...ROLE_CODES].sort()).toEqual(expected.sort());
  });
});
