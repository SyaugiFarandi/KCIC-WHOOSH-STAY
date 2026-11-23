import { describe, expect, it } from 'vitest';
import type {
  OccupancyCalendarResult,
  OccupancyForecastResult,
  OccupancySummary,
  OccupancyTrendResult,
} from '@whoosh/shared';
import { DEMO_ACCOUNTS, expectSuccessEnvelope, loginAs } from './helpers.js';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function expectTotalsConsistent(summary: OccupancySummary) {
  const breakdownTotal = summary.statusBreakdown.reduce((sum, item) => sum + item.beds, 0);
  expect(breakdownTotal).toBe(summary.totals.capacity);
  const statusTotal =
    summary.totals.available +
    summary.totals.reserved +
    summary.totals.occupied +
    summary.totals.cleaning +
    summary.totals.maintenance +
    summary.totals.blocked;
  expect(statusTotal).toBe(summary.totals.capacity);
  const dormitoryCapacity = summary.dormitories.reduce((sum, row) => sum + row.capacity, 0);
  expect(dormitoryCapacity).toBe(summary.totals.capacity);
  if (summary.totals.capacity > 0) {
    expect(summary.occupancyRate).not.toBeNull();
    expect(summary.occupancyRate!).toBeGreaterThanOrEqual(0);
    expect(summary.occupancyRate!).toBeLessThanOrEqual(100);
  } else {
    expect(summary.occupancyRate).toBeNull();
  }
}

describe('occupancy intelligence', () => {
  it('returns a consistent capacity and status breakdown for administrators', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await agent.get('/api/v1/occupancy/summary');
    expect(response.status).toBe(200);
    expectSuccessEnvelope(response.body);
    const data = response.body.data as OccupancySummary;
    expect(data.scope.level).toBe('global');
    expect(data.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(data.totals.capacity).toBeGreaterThan(0);
    expect(data.formulas.length).toBeGreaterThan(0);
    expect(data.dataQuality.notes.length).toBeGreaterThan(0);
    expectTotalsConsistent(data);
    for (const row of data.dormitories) {
      const rowTotal =
        row.available + row.reserved + row.occupied + row.cleaning + row.maintenance + row.blocked;
      expect(rowTotal).toBe(row.capacity);
    }
  });

  it('keeps dashboard, calendar and report capacity aligned with occupancy', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const date = isoDate(0);
    const summary = await agent.get('/api/v1/occupancy/summary').query({ date });
    const summaryData = summary.body.data as OccupancySummary;

    const dashboard = await agent.get('/api/v1/dashboard/operations');
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.data.occupancy.totalBeds).toBe(summaryData.totals.capacity);

    const calendar = await agent
      .get('/api/v1/calendar')
      .query({ from: date, to: isoDate(7) });
    expect(calendar.status).toBe(200);
    expect((calendar.body.data as OccupancyCalendarResult).totalBeds).toBe(
      summaryData.totals.capacity,
    );

    const report = await agent.get('/api/v1/reports/occupancy');
    expect(report.status).toBe(200);
    expect(report.body.data.totals.totalBeds).toBe(summaryData.totals.capacity);
  });

  it('returns a bounded daily trend with consistent totals', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await agent
      .get('/api/v1/occupancy/trend')
      .query({ from: isoDate(0), to: isoDate(7) });
    expect(response.status).toBe(200);
    expectSuccessEnvelope(response.body);
    const data = response.body.data as OccupancyTrendResult;
    expect(data.days).toHaveLength(7);
    for (const day of data.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(
        day.available + day.reserved + day.occupied + day.cleaning + day.maintenance + day.blocked,
      ).toBe(day.capacity);
      if (day.capacity > 0) {
        expect(day.occupancyRate).not.toBeNull();
        expect(day.occupancyRate!).toBeGreaterThanOrEqual(0);
        expect(day.occupancyRate!).toBeLessThanOrEqual(100);
      } else {
        expect(day.occupancyRate).toBeNull();
      }
    }
  });

  it('returns a declared forecast basis with honest projections', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await agent
      .get('/api/v1/occupancy/forecast')
      .query({ from: isoDate(0), to: isoDate(14) });
    expect(response.status).toBe(200);
    expectSuccessEnvelope(response.body);
    const data = response.body.data as OccupancyForecastResult;
    expect(data.days).toHaveLength(14);
    expect(['OK', 'INSUFFICIENT_DATA']).toContain(data.status);
    expect(['CONFIRMED_ONLY', 'ROSTER_INCLUDED']).toContain(data.basis);
    expect(['HIGH', 'MEDIUM', 'LOW']).toContain(data.confidence);
    expect(data.dataQuality.notes.length).toBeGreaterThan(0);
    for (const day of data.days) {
      expect(day.confirmedOccupied).toBeGreaterThanOrEqual(0);
      expect(day.confirmedOccupied).toBeLessThanOrEqual(day.capacity);
      expect(day.rosterSignal).toBeGreaterThanOrEqual(0);
      if (day.projectedDemand === null) {
        expect(day.projectedOccupancyRate).toBeNull();
      } else {
        expect(day.projectedOccupancyRate).not.toBeNull();
        expect(day.overCapacity).toBe(day.projectedDemand > day.capacity);
      }
    }
    if (data.status === 'INSUFFICIENT_DATA') {
      expect(data.days.every((day) => day.projectedDemand === null)).toBe(true);
    }
  });

  it('restricts dormitory-scoped managers to their own capacity', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const allDormitories = await admin.agent.get('/api/v1/dormitories?pageSize=50');
    expect(allDormitories.status).toBe(200);
    const dormitoryIds = (allDormitories.body.data.items as Array<{ id: string }>).map(
      (item) => item.id,
    );

    const manager = await loginAs('manager.karawang@demo.whoosh-stay.local');
    const response = await manager.agent.get('/api/v1/occupancy/summary');
    expect(response.status).toBe(200);
    const data = response.body.data as OccupancySummary;
    expect(data.scope.level).toBe('dormitory');
    expect(data.scope.dormitoryIds.length).toBeGreaterThan(0);
    const scopedIds = new Set(data.dormitories.map((row) => row.dormitoryId));
    for (const id of scopedIds) {
      expect(data.scope.dormitoryIds).toContain(id);
    }

    const outside = dormitoryIds.find((id) => !data.scope.dormitoryIds.includes(id));
    expect(outside).toBeDefined();
    const forbidden = await manager.agent
      .get('/api/v1/occupancy/summary')
      .query({ dormitoryId: outside });
    expect(forbidden.status).toBe(403);
  });

  it('denies roles without occupancy.read and rejects invalid ranges', async () => {
    for (const email of [DEMO_ACCOUNTS.crew, DEMO_ACCOUNTS.housekeeping]) {
      const { agent } = await loginAs(email);
      const response = await agent.get('/api/v1/occupancy/summary');
      expect(response.status).toBe(403);
    }

    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const tooWide = await agent
      .get('/api/v1/occupancy/trend')
      .query({ from: isoDate(0), to: isoDate(120) });
    expect(tooWide.status).toBe(400);

    const invalidDate = await agent.get('/api/v1/occupancy/summary').query({ date: '2026-02-31' });
    expect(invalidDate.status).toBe(400);

    const reversed = await agent
      .get('/api/v1/occupancy/forecast')
      .query({ from: isoDate(5), to: isoDate(1) });
    expect(reversed.status).toBe(400);
  });
});
