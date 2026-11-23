import type { PrismaClient } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { ServiceUnavailableError } from '../../middleware/errors.js';
import { writeAudit } from '../audit/audit.js';
import { createEmployeeProvider, isHttpEmployeeSyncConfigured } from './http-provider.js';
import type { EmployeeProvider } from './provider.js';

export interface SyncSummary {
  runId: string;
  fetched: number;
  inserted: number;
  updated: number;
  failed: number;
  status: 'SUCCEEDED' | 'PARTIAL' | 'FAILED';
}

export function isEmployeeSyncAvailable(): boolean {
  return env.EMPLOYEE_SYNC_ENABLED || env.NODE_ENV !== 'production';
}

export type EmployeeSyncMode = 'DISABLED' | 'MOCK' | 'CONFIGURED';

export function employeeSyncMode(): EmployeeSyncMode {
  if (!isEmployeeSyncAvailable()) return 'DISABLED';
  return isHttpEmployeeSyncConfigured() ? 'CONFIGURED' : 'MOCK';
}

export async function syncEmployees(options: {
  actorUserId?: string | null;
  provider?: EmployeeProvider;
  client?: PrismaClient;
} = {}): Promise<SyncSummary> {
  if (!isEmployeeSyncAvailable()) {
    throw new ServiceUnavailableError('Employee synchronization is disabled by configuration');
  }

  const client = options.client ?? prisma;
  const provider = options.provider ?? createEmployeeProvider();

  const run = await client.employeeSyncLog.create({
    data: {
      sourceSystem: provider.sourceSystem,
      status: 'RUNNING',
      initiatedBy: options.actorUserId ?? null,
    },
  });

  let fetched = 0;
  let inserted = 0;
  let updated = 0;
  let failed = 0;

  try {
    const records = await provider.fetchEmployees();
    fetched = records.length;

    for (const record of records) {
      const existing = await client.employee.findUnique({
        where: {
          sourceSystem_externalEmployeeId: {
            sourceSystem: record.sourceSystem,
            externalEmployeeId: record.externalEmployeeId,
          },
        },
        select: { id: true },
      });

      await client.employee.upsert({
        where: {
          sourceSystem_externalEmployeeId: {
            sourceSystem: record.sourceSystem,
            externalEmployeeId: record.externalEmployeeId,
          },
        },
        update: {
          employeeCode: record.employeeCode,
          fullName: record.fullName,
          workEmail: record.workEmail,
          departmentCode: record.departmentCode,
          departmentName: record.departmentName,
          positionCode: record.positionCode,
          positionName: record.positionName,
          homeStationCode: record.homeStationCode,
          employmentStatus: record.employmentStatus,
          eligibilityStatus: record.eligibilityStatus,
          sourceUpdatedAt: record.sourceUpdatedAt,
          syncedAt: new Date(),
        },
        create: {
          ...record,
          syncedAt: new Date(),
        },
      });

      if (existing) updated += 1;
      else inserted += 1;
    }

    const summary: SyncSummary = {
      runId: run.id,
      fetched,
      inserted,
      updated,
      failed,
      status: failed > 0 ? 'PARTIAL' : 'SUCCEEDED',
    };

    await client.employeeSyncLog.update({
      where: { id: run.id },
      data: {
        status: summary.status,
        finishedAt: new Date(),
        fetchedCount: summary.fetched,
        insertedCount: summary.inserted,
        updatedCount: summary.updated,
        failedCount: summary.failed,
      },
    });

    await writeAudit({
      actorUserId: options.actorUserId ?? null,
      action: 'EMPLOYEE_SYNC_COMPLETED',
      entityType: 'EMPLOYEE_SYNC',
      entityId: run.id,
      afterData: { ...summary },
    });

    return summary;
  } catch (error) {
    failed += 1;
    await client.employeeSyncLog.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        finishedAt: new Date(),
        fetchedCount: fetched,
        insertedCount: inserted,
        updatedCount: updated,
        failedCount: failed,
        errorSummary: error instanceof Error ? error.message.slice(0, 1000) : 'Unknown error',
      },
    });
    throw error;
  }
}
