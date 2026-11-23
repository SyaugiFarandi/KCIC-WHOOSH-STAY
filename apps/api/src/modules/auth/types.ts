import type { PermissionCode, RoleCode, ScopeType } from '@whoosh/shared';

export interface PrincipalRole {
  roleCode: RoleCode;
  scopeType: ScopeType;
  scopeId: string | null;
  permissions: PermissionCode[];
}

export interface PrincipalUser {
  id: string;
  email: string;
  displayName: string;
  status: string;
  employeeId: string | null;
  employeeName: string | null;
}

export interface Principal {
  user: PrincipalUser;
  roles: PrincipalRole[];
  permissions: PermissionCode[];
  session: {
    id: string;
    expiresAt: Date;
  };
}

export interface AccessScope {
  global: boolean;
  dormitoryIds: string[];
  buildingIds: string[];
  selfOnly: boolean;
  assignedTaskOnly: boolean;
}

export function hasPermission(principal: Principal, permission: PermissionCode): boolean {
  return principal.permissions.includes(permission);
}

export function hasAnyPermission(
  principal: Principal,
  permissions: readonly PermissionCode[],
): boolean {
  return permissions.some((permission) => principal.permissions.includes(permission));
}

export function hasRole(principal: Principal, ...roleCodes: RoleCode[]): boolean {
  return principal.roles.some((role) => roleCodes.includes(role.roleCode));
}

export function resolveAccessScope(
  principal: Principal,
  permission?: PermissionCode,
): AccessScope {
  const scope: AccessScope = {
    global: false,
    dormitoryIds: [],
    buildingIds: [],
    selfOnly: false,
    assignedTaskOnly: false,
  };

  for (const role of principal.roles) {
    if (permission && !role.permissions.includes(permission)) continue;
    switch (role.scopeType) {
      case 'GLOBAL':
        scope.global = true;
        break;
      case 'DORMITORY':
        if (role.scopeId) scope.dormitoryIds.push(role.scopeId);
        break;
      case 'BUILDING':
        if (role.scopeId) scope.buildingIds.push(role.scopeId);
        break;
      case 'SELF':
        scope.selfOnly = true;
        break;
      case 'ASSIGNED_TASK':
        scope.assignedTaskOnly = true;
        break;
    }
  }

  scope.dormitoryIds = [...new Set(scope.dormitoryIds)];
  scope.buildingIds = [...new Set(scope.buildingIds)];
  return scope;
}

export function scopeIsEmpty(scope: AccessScope): boolean {
  return (
    !scope.global &&
    scope.dormitoryIds.length === 0 &&
    scope.buildingIds.length === 0 &&
    !scope.selfOnly &&
    !scope.assignedTaskOnly
  );
}
