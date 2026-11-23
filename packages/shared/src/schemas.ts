import { z } from 'zod';
import { PERMISSION_CODES, ROLE_CODES, SCOPE_TYPES, USER_STATUSES } from './permissions.js';

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(200),
  total: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

export function createPaginationQuerySchema(
  defaults: { pageSize?: number; maxPageSize?: number } = {},
) {
  const { pageSize = 15, maxPageSize = 100 } = defaults;
  return z.object({
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(maxPageSize).default(pageSize),
    q: z.string().trim().max(120).optional(),
    sort: z.string().trim().max(60).optional(),
  });
}

export const paginationQuerySchema = createPaginationQuerySchema();

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.array(z.unknown()).optional(),
  }),
  meta: z.object({ requestId: z.string() }),
});

export function successEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.object({
    success: z.literal(true),
    data,
    meta: z.object({
      requestId: z.string(),
      pagination: paginationMetaSchema.optional(),
    }),
  });
}

export const roleAssignmentSchema = z.object({
  roleCode: z.enum(ROLE_CODES),
  scopeType: z.enum(SCOPE_TYPES),
  scopeId: z.uuid().nullable().optional(),
});

export type RoleAssignment = z.infer<typeof roleAssignmentSchema>;

export const authUserSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  status: z.enum(USER_STATUSES),
  employeeId: z.uuid().nullable(),
  employeeName: z.string().nullable(),
});

export const employeeSummarySchema = z.object({
  id: z.uuid(),
  employeeCode: z.string(),
  fullName: z.string(),
  workEmail: z.email().nullable(),
  departmentCode: z.string().nullable(),
  departmentName: z.string().nullable(),
  divisionCode: z.string().nullable(),
  divisionName: z.string().nullable(),
  positionCode: z.string().nullable(),
  positionName: z.string().nullable(),
  homeStationCode: z.string().nullable(),
  joinDate: z.string().nullable(),
  employmentStatus: z.string(),
  eligibilityStatus: z.string(),
  sourceSystem: z.string(),
  syncedAt: z.string().nullable(),
});

export type EmployeeSummary = z.infer<typeof employeeSummarySchema>;

export const employeeDetailSchema = employeeSummarySchema.extend({
  supervisor: z
    .object({ id: z.uuid(), employeeCode: z.string(), fullName: z.string() })
    .nullable(),
  subordinateCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type EmployeeDetail = z.infer<typeof employeeDetailSchema>;

export const AUTH_MODES = ['mock', 'oidc', 'password'] as const;

export const authMeSchema = z.object({
  user: authUserSchema,
  roles: z.array(roleAssignmentSchema),
  permissions: z.array(z.enum(PERMISSION_CODES as [string, ...string[]])),
  session: z.object({
    expiresAt: z.string(),
    authMode: z.enum(AUTH_MODES),
  }),
});

export type AuthMe = z.infer<typeof authMeSchema>;

export const telegramChatLinkSchema = z.object({
  chatId: z
    .string()
    .trim()
    .regex(/^-?\d{5,20}$/, 'Chat ID Telegram harus berupa angka 5 sampai 20 digit.')
    .nullable(),
});

export type TelegramChatLinkInput = z.infer<typeof telegramChatLinkSchema>;

export const authConfigSchema = z.object({
  mode: z.enum(AUTH_MODES),
  demoAccounts: z
    .array(
      z.object({
        email: z.email(),
        displayName: z.string(),
        roleCodes: z.array(z.enum(ROLE_CODES)),
      }),
    )
    .optional(),
});

export type AuthConfig = z.infer<typeof authConfigSchema>;

export const loginDevSchema = z.object({
  email: z.email(),
});

export type LoginDevInput = z.infer<typeof loginDevSchema>;

export const demoLoginSchema = z.object({
  username: z.string().trim().min(3).max(150),
  password: z.string().min(1).max(200),
});

export type DemoLoginInput = z.infer<typeof demoLoginSchema>;

export const passwordLoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(200),
});

export type PasswordLoginInput = z.infer<typeof passwordLoginSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(12, 'Password baru minimal 12 karakter.').max(200),
});

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const userSummarySchema = z.object({
  id: z.uuid(),
  email: z.email(),
  displayName: z.string(),
  status: z.enum(USER_STATUSES),
  employeeId: z.uuid().nullable(),
  employeeName: z.string().nullable(),
  roles: z.array(roleAssignmentSchema),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export type UserSummary = z.infer<typeof userSummarySchema>;

export const updateUserSchema = z.object({
  displayName: z.string().trim().min(2).max(150).optional(),
  status: z.enum(USER_STATUSES).optional(),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const bulkUserStatusSchema = z.object({
  userIds: z.array(z.uuid()).min(1).max(100),
  status: z.enum(USER_STATUSES),
});

export type BulkUserStatusInput = z.infer<typeof bulkUserStatusSchema>;

export const assignRolesSchema = z
  .object({
    assignments: z.array(roleAssignmentSchema).max(10),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();
    for (const assignment of value.assignments) {
      if (
        (assignment.scopeType === 'GLOBAL' || assignment.scopeType === 'SELF') &&
        assignment.scopeId
      ) {
        ctx.addIssue({
          code: 'custom',
          message: `${assignment.scopeType} scope must not include scopeId`,
        });
      }
      if (
        (assignment.scopeType === 'DORMITORY' || assignment.scopeType === 'BUILDING') &&
        !assignment.scopeId
      ) {
        ctx.addIssue({ code: 'custom', message: `${assignment.scopeType} scope requires scopeId` });
      }
      const key = `${assignment.roleCode}:${assignment.scopeType}:${assignment.scopeId ?? ''}`;
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate assignment ${key}` });
      }
      seen.add(key);
    }
  });

export type AssignRolesInput = z.infer<typeof assignRolesSchema>;

export const roleSummarySchema = z.object({
  code: z.enum(ROLE_CODES),
  name: z.string(),
  description: z.string().nullable(),
  permissions: z.array(z.string()),
});

export type RoleSummary = z.infer<typeof roleSummarySchema>;

export const auditLogEntrySchema = z.object({
  id: z.uuid(),
  actorUserId: z.uuid().nullable(),
  actorName: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.uuid().nullable(),
  reason: z.string().nullable(),
  requestId: z.string().nullable(),
  beforeData: z.unknown().optional(),
  afterData: z.unknown().optional(),
  ipAddress: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const dashboardOverviewSchema = z.object({
  counts: z.object({
    users: z.number().int(),
    employees: z.number().int(),
    roles: z.number().int(),
    activeSessions: z.number().int(),
  }),
  integrations: z.object({
    authMode: z.enum(AUTH_MODES),
    employeeSync: z.enum(['MOCK', 'CONFIGURED', 'DISABLED']),
    rosterSync: z.enum(['MOCK', 'CONFIGURED', 'DISABLED']),
  }),
  generatedAt: z.string(),
});

export type DashboardOverview = z.infer<typeof dashboardOverviewSchema>;

export const permissionListSchema = z.object({
  permissions: z.array(z.string()),
});

export const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  time: z.string(),
  checks: z.record(z.string(), z.string()).optional(),
});

export type Health = z.infer<typeof healthSchema>;

export type ApiSuccess<T> = {
  success: true;
  data: T;
  meta: { requestId: string; pagination?: PaginationMeta };
};

export type ApiFailure = z.infer<typeof errorEnvelopeSchema>;
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export type Paginated<T> = {
  items: T[];
  pagination: PaginationMeta;
};

export type SortDirection = 'asc' | 'desc';
