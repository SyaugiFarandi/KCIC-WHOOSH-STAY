import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { todayDateOnly } from '../../src/lib/dates.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

interface StatusSummary {
  total: number;
  byStatus: Record<string, number>;
  generatedAt: string;
}

function sumValues(record: Record<string, number>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

describe('analytics summary endpoints', () => {
  it('housekeeping summary matches the scoped task list for admin and front desk', async () => {
    for (const email of [DEMO_ACCOUNTS.admin, DEMO_ACCOUNTS.frontdesk]) {
      const { agent } = await loginAs(email);
      const summary = await agent.get('/api/v1/housekeeping/summary');
      expect(summary.status).toBe(200);
      const data = summary.body.data as StatusSummary & {
        open: number;
        byType: Record<string, number>;
      };
      const list = await agent.get('/api/v1/housekeeping/tasks?pageSize=1');
      expect(list.status).toBe(200);
      expect(data.total).toBe(list.body.data.pagination.total);
      expect(sumValues(data.byStatus)).toBe(data.total);
      expect(sumValues(data.byType)).toBe(data.total);
      expect(data.open).toBe(
        (data.byStatus.PENDING ?? 0) + (data.byStatus.IN_PROGRESS ?? 0),
      );

      const pending = await agent.get('/api/v1/housekeeping/tasks?status=PENDING&pageSize=1');
      expect(pending.status).toBe(200);
      expect(data.byStatus.PENDING ?? 0).toBe(pending.body.data.pagination.total);
    }
  });

  it('housekeeping summary for an assigned-task account matches its scoped list', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.housekeeping);
    const userId = body.data.user.id;
    const summary = await agent.get('/api/v1/housekeeping/summary');
    expect(summary.status).toBe(200);
    const list = await agent.get('/api/v1/housekeeping/tasks?pageSize=1');
    expect(list.status).toBe(200);
    expect(summary.body.data.total).toBe(list.body.data.pagination.total);
    const mine = await agent.get('/api/v1/housekeeping/tasks?mine=true&pageSize=100');
    expect(mine.status).toBe(200);
    expect(mine.body.data.pagination.total).toBeLessThanOrEqual(summary.body.data.total);
    for (const item of mine.body.data.items) {
      expect(item.assignedTo).toBe(userId);
    }
  });

  it('maintenance summary matches the scoped ticket list and priority breakdown', async () => {
    for (const email of [DEMO_ACCOUNTS.admin, DEMO_ACCOUNTS.frontdesk]) {
      const { agent } = await loginAs(email);
      const summary = await agent.get('/api/v1/maintenance/summary');
      expect(summary.status).toBe(200);
      const data = summary.body.data as StatusSummary & {
        open: number;
        byPriority: Record<string, number>;
      };
      const list = await agent.get('/api/v1/maintenance/tickets?pageSize=1');
      expect(list.status).toBe(200);
      expect(data.total).toBe(list.body.data.pagination.total);
      expect(sumValues(data.byStatus)).toBe(data.total);
      expect(sumValues(data.byPriority)).toBe(data.total);
      expect(data.open).toBe(
        (data.byStatus.OPEN ?? 0) +
          (data.byStatus.IN_REVIEW ?? 0) +
          (data.byStatus.IN_PROGRESS ?? 0),
      );
    }
  });

  it('maintenance summary for a self-scoped account matches its scoped list', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.maintenance);
    const summary = await agent.get('/api/v1/maintenance/summary');
    expect(summary.status).toBe(200);
    const list = await agent.get('/api/v1/maintenance/tickets?pageSize=1');
    expect(list.status).toBe(200);
    expect(summary.body.data.total).toBe(list.body.data.pagination.total);
  });

  it('reservations summary matches the scoped reservation list', async () => {
    for (const email of [DEMO_ACCOUNTS.admin, DEMO_ACCOUNTS.frontdesk, DEMO_ACCOUNTS.crew]) {
      const { agent } = await loginAs(email);
      const summary = await agent.get('/api/v1/reservations/summary');
      expect(summary.status).toBe(200);
      const data = summary.body.data as StatusSummary & {
        pendingApproval: number;
        arrivingToday: number;
        departingToday: number;
      };
      const list = await agent.get('/api/v1/reservations?pageSize=1');
      expect(list.status).toBe(200);
      expect(data.total).toBe(list.body.data.pagination.total);
      expect(sumValues(data.byStatus)).toBe(data.total);

      const pending = await agent.get(
        '/api/v1/reservations?status=PENDING_APPROVAL&pageSize=1',
      );
      expect(pending.status).toBe(200);
      expect(data.byStatus.PENDING_APPROVAL ?? 0).toBe(pending.body.data.pagination.total);
    }
  });

  it('reservations summary today counters match date-scoped database counts', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const summary = await agent.get('/api/v1/reservations/summary');
    expect(summary.status).toBe(200);
    const today = todayDateOnly();
    const activeStatuses = { notIn: ['CANCELLED', 'REJECTED'] };
    const [arriving, departing] = await Promise.all([
      prisma.reservation.count({ where: { checkInDate: today, status: activeStatuses } }),
      prisma.reservation.count({ where: { checkOutDate: today, status: activeStatuses } }),
    ]);
    expect(summary.body.data.arrivingToday).toBe(arriving);
    expect(summary.body.data.departingToday).toBe(departing);
  });

  it('employees summary aggregates employment statuses for admins', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const summary = await agent.get('/api/v1/employees/summary');
    expect(summary.status).toBe(200);
    const data = summary.body.data as StatusSummary & {
      departments: number;
      positions: number;
      lastSyncedAt: string | null;
    };
    const total = await prisma.employee.count();
    expect(data.total).toBe(total);
    expect(sumValues(data.byStatus)).toBe(total);
    const grouped = await prisma.employee.groupBy({
      by: ['employmentStatus'],
      _count: { _all: true },
    });
    for (const row of grouped) {
      expect(data.byStatus[row.employmentStatus]).toBe(row._count._all);
    }
  });

  it('denies summary endpoints without the module read permission', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const employees = await crew.agent.get('/api/v1/employees/summary');
    expect(employees.status).toBe(403);
    const housekeeping = await crew.agent.get('/api/v1/housekeeping/summary');
    expect(housekeeping.status).toBe(403);
    const maintenance = await crew.agent.get('/api/v1/maintenance/summary');
    expect(maintenance.status).toBe(403);
  });
});