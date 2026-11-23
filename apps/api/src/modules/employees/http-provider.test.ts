import { describe, expect, it, vi } from 'vitest';
import { HttpEmployeeProvider, type FetchLike } from './http-provider.js';

const BASE_CONFIG = {
  baseUrl: 'https://hr.example.test/api',
  path: '/employees',
  sourceSystem: 'EXTERNAL_HR',
  authType: 'bearer' as const,
  token: 'test-token',
  timeoutMs: 5_000,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('HttpEmployeeProvider', () => {
  it('maps a snake_case envelope into external employee records', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonResponse({
        data: [
          {
            external_employee_id: 1001,
            employee_code: 'EMP-1001',
            full_name: 'Nadia Putri',
            work_email: 'nadia@example.test',
            department_code: 'OPS',
            department_name: 'Operations',
            position_code: 'CREW',
            position_name: 'Crew',
            home_station_code: 'GMR',
            employment_status: 'active',
            eligibility_status: 'eligible',
            source_updated_at: '2026-11-01T10:00:00.000Z',
          },
        ],
      }),
    );
    const provider = new HttpEmployeeProvider({ ...BASE_CONFIG, fetchImpl });

    const records = await provider.fetchEmployees();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      sourceSystem: 'EXTERNAL_HR',
      externalEmployeeId: '1001',
      employeeCode: 'EMP-1001',
      fullName: 'Nadia Putri',
      workEmail: 'nadia@example.test',
      departmentCode: 'OPS',
      employmentStatus: 'ACTIVE',
      eligibilityStatus: 'ELIGIBLE',
    });
    expect(records[0].sourceUpdatedAt?.toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });

  it('accepts a plain camelCase array and applies safe defaults', async () => {
    const fetchImpl: FetchLike = vi.fn(async () =>
      jsonResponse([
        {
          externalEmployeeId: 'X-2',
          employeeCode: 'EMP-2',
          fullName: 'Budi Santoso',
          workEmail: null,
        },
      ]),
    );
    const provider = new HttpEmployeeProvider({ ...BASE_CONFIG, authType: 'none', fetchImpl });

    const [record] = await provider.fetchEmployees();

    expect(record.employmentStatus).toBe('ACTIVE');
    expect(record.eligibilityStatus).toBe('PENDING');
    expect(record.workEmail).toBeNull();
    expect(record.sourceUpdatedAt).toBeNull();
  });

  it('sends bearer, api-key and basic credentials in headers', async () => {
    const cases = [
      {
        config: { authType: 'bearer' as const, token: 'abc' },
        expected: { Authorization: 'Bearer abc' },
      },
      {
        config: { authType: 'api-key' as const, token: 'key-1', apiKeyHeader: 'x-hr-key' },
        expected: { 'x-hr-key': 'key-1' },
      },
      {
        config: { authType: 'basic' as const, username: 'sync', password: 'secret' },
        expected: { Authorization: `Basic ${Buffer.from('sync:secret').toString('base64')}` },
      },
    ];

    for (const testCase of cases) {
      const fetchImpl: FetchLike = vi.fn(async () =>
        jsonResponse([
          { externalEmployeeId: '1', employeeCode: 'E-1', fullName: 'Test User' },
        ]),
      );
      const provider = new HttpEmployeeProvider({ ...BASE_CONFIG, ...testCase.config, fetchImpl });

      await provider.fetchEmployees();

      const init = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1];
      const headers = init?.headers as Record<string, string>;
      for (const [name, value] of Object.entries(testCase.expected)) {
        expect(headers[name]).toBe(value);
      }
    }
  });

  it('joins base URL and path without duplicate slashes', async () => {
    const fetchImpl: FetchLike = vi.fn(async () => jsonResponse([]));
    const provider = new HttpEmployeeProvider({
      ...BASE_CONFIG,
      baseUrl: 'https://hr.example.test/api/',
      path: 'v2/employees',
      fetchImpl,
    });

    await provider.fetchEmployees();

    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
      'https://hr.example.test/api/v2/employees',
    );
  });

  it('throws on non-success HTTP responses', async () => {
    const provider = new HttpEmployeeProvider({
      ...BASE_CONFIG,
      fetchImpl: async () => jsonResponse({ error: 'boom' }, 503),
    });

    await expect(provider.fetchEmployees()).rejects.toThrow(/HTTP 503/);
  });

  it('throws when the payload shape is unexpected', async () => {
    const provider = new HttpEmployeeProvider({
      ...BASE_CONFIG,
      fetchImpl: async () => jsonResponse({ result: [] }),
    });

    await expect(provider.fetchEmployees()).rejects.toThrow(/must be an array/);
  });

  it('rejects an invalid record and identifies its index', async () => {
    const provider = new HttpEmployeeProvider({
      ...BASE_CONFIG,
      fetchImpl: async () =>
        jsonResponse([{ externalEmployeeId: '1', employeeCode: 'E-1', fullName: 'Valid' }, { employeeCode: 'E-2' }]),
    });

    await expect(provider.fetchEmployees()).rejects.toThrow(/index 1 is invalid/);
  });
});
