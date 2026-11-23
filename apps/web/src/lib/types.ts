import type { PaginationMeta, RoleAssignment } from '@whoosh/shared';

export interface Paged<T> {
  items: T[];
  pagination: PaginationMeta;
}

export interface ScopeOptions {
  dormitories: Array<{ id: string; code: string; name: string }>;
  buildings: Array<{ id: string; code: string; name: string; dormitoryId: string }>;
}

export interface EmployeeSyncRun {
  id: string;
  sourceSystem: string;
  startedAt: string;
  finishedAt: string | null;
  status: string;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  failedCount: number;
  errorSummary: string | null;
}

export interface EmployeeSyncRunsResponse {
  items: EmployeeSyncRun[];
  pagination?: PaginationMeta;
  integrationStatus: 'MOCK' | 'CONFIGURED' | 'DISABLED';
}

export interface DashboardOverview {
  counts: { users: number; employees: number; roles: number; activeSessions: number };
  integrations: {
    authMode: 'mock' | 'oidc' | 'password';
    employeeSync: 'MOCK' | 'CONFIGURED' | 'DISABLED';
    rosterSync: 'MOCK' | 'CONFIGURED' | 'DISABLED';
  };
  generatedAt: string;
}

export type UserRoleAssignment = RoleAssignment;

export interface AdminUser {
  id: string;
  email: string;
  displayName: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  employeeId: string | null;
  employeeName: string | null;
  roles: UserRoleAssignment[];
  lastLoginAt: string | null;
  createdAt: string;
}
