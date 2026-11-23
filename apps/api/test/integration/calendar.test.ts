import { describe, expect, it } from 'vitest';
import type { OccupancyCalendarResult } from '@whoosh/shared';
import { DEMO_ACCOUNTS, expectSuccessEnvelope, loginAs } from './helpers.js';

function isoDate(offsetDays: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

describe('occupancy calendar', () => {
  it('returns per-day occupancy and arrival/departure events for administrators', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await agent
      .get('/api/v1/calendar')
      .query({ from: isoDate(0), to: isoDate(7) });

    expect(response.status).toBe(200);
    expectSuccessEnvelope(response.body);
    const data = response.body.data as OccupancyCalendarResult;
    expect(data.days).toHaveLength(7);
    expect(data.totalBeds).toBeGreaterThan(0);
    for (const day of data.days) {
      expect(day.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(day.occupiedBeds).toBeGreaterThanOrEqual(0);
      expect(day.occupiedBeds).toBeLessThanOrEqual(day.totalBeds);
      expect(day.availableBeds).toBe(day.totalBeds - day.occupiedBeds);
      expect(day.occupancyRate).toBeGreaterThanOrEqual(0);
      expect(day.occupancyRate).toBeLessThanOrEqual(100);
      expect(Array.isArray(day.arrivals)).toBe(true);
      expect(Array.isArray(day.departures)).toBe(true);
    }
  });

  it('rejects invalid ranges and management-only access', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const tooWide = await agent
      .get('/api/v1/calendar')
      .query({ from: isoDate(0), to: isoDate(90) });
    expect(tooWide.status).toBe(400);

    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const forbidden = await crew.agent
      .get('/api/v1/calendar')
      .query({ from: isoDate(0), to: isoDate(7) });
    expect(forbidden.status).toBe(403);
  });
});
