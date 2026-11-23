import { z } from 'zod';
import { env } from '../../config/env.js';
import { MockEmployeeProvider, type EmployeeProvider, type ExternalEmployeeRecord } from './provider.js';

export type EmployeeSyncAuthType = 'none' | 'bearer' | 'api-key' | 'basic';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpEmployeeProviderConfig {
  baseUrl: string;
  path?: string;
  sourceSystem: string;
  authType: EmployeeSyncAuthType;
  token?: string;
  apiKeyHeader?: string;
  username?: string;
  password?: string;
  timeoutMs?: number;
  fetchImpl?: FetchLike;
}

function camelizeKeys(item: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...item };
  for (const [key, value] of Object.entries(item)) {
    const camel = key.replace(/[_-]+([a-z0-9])/gi, (_match, char: string) => char.toUpperCase());
    if (!(camel in normalized)) normalized[camel] = value;
  }
  return normalized;
}

function optionalText(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? null : date;
}

const externalEmployeeSchema = z.object({
  externalEmployeeId: z.union([z.string(), z.number()]),
  employeeCode: z.string().min(1),
  fullName: z.string().min(1),
  workEmail: z.string().nullish(),
  departmentCode: z.string().nullish(),
  departmentName: z.string().nullish(),
  positionCode: z.string().nullish(),
  positionName: z.string().nullish(),
  homeStationCode: z.string().nullish(),
  employmentStatus: z.string().nullish(),
  eligibilityStatus: z.string().nullish(),
  sourceUpdatedAt: z.union([z.string(), z.number(), z.date()]).nullish(),
});

function toRecord(item: unknown, sourceSystem: string, index: number): ExternalEmployeeRecord {
  if (typeof item !== 'object' || item === null || Array.isArray(item)) {
    throw new Error(`Employee record at index ${index} is not an object`);
  }

  const parsed = externalEmployeeSchema.safeParse(camelizeKeys(item as Record<string, unknown>));
  if (!parsed.success) {
    const fields = parsed.error.issues
      .map((issue) => issue.path.join('.') || 'record')
      .join(', ');
    throw new Error(`Employee record at index ${index} is invalid: ${fields}`);
  }

  const data = parsed.data;
  return {
    sourceSystem,
    externalEmployeeId: String(data.externalEmployeeId).trim(),
    employeeCode: data.employeeCode.trim(),
    fullName: data.fullName.trim(),
    workEmail: optionalText(data.workEmail),
    departmentCode: optionalText(data.departmentCode),
    departmentName: optionalText(data.departmentName),
    positionCode: optionalText(data.positionCode),
    positionName: optionalText(data.positionName),
    homeStationCode: optionalText(data.homeStationCode),
    employmentStatus: optionalText(data.employmentStatus)?.toUpperCase() ?? 'ACTIVE',
    eligibilityStatus: optionalText(data.eligibilityStatus)?.toUpperCase() ?? 'PENDING',
    sourceUpdatedAt: parseDate(data.sourceUpdatedAt),
  };
}

export class HttpEmployeeProvider implements EmployeeProvider {
  readonly sourceSystem: string;
  private readonly config: HttpEmployeeProviderConfig;
  private readonly fetchImpl: FetchLike;

  constructor(config: HttpEmployeeProviderConfig) {
    if (!config.baseUrl) throw new Error('EMPLOYEE_SYNC_BASE_URL is required');
    this.config = config;
    this.sourceSystem = config.sourceSystem;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private buildUrl(): string {
    const base = this.config.baseUrl.replace(/\/+$/, '');
    const path = this.config.path ?? '/employees';
    return `${base}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private authHeaders(): Record<string, string> {
    const { authType, token, username, password } = this.config;
    if (authType === 'bearer' && token) return { Authorization: `Bearer ${token}` };
    if (authType === 'api-key' && token) return { [this.config.apiKeyHeader ?? 'x-api-key']: token };
    if (authType === 'basic' && username !== undefined && password !== undefined) {
      return { Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` };
    }
    return {};
  }

  async fetchEmployees(): Promise<ExternalEmployeeRecord[]> {
    const response = await this.fetchImpl(this.buildUrl(), {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...this.authHeaders(),
      },
      signal: AbortSignal.timeout(this.config.timeoutMs ?? 15_000),
    });

    if (!response.ok) {
      throw new Error(
        `Employee sync request failed with HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
      );
    }

    const payload: unknown = await response.json();
    const items = Array.isArray(payload)
      ? payload
      : typeof payload === 'object' && payload !== null
        ? ((payload as Record<string, unknown>).items ??
          (payload as Record<string, unknown>).data ??
          (payload as Record<string, unknown>).employees)
        : undefined;

    if (!Array.isArray(items)) {
      throw new Error('Employee sync response must be an array or an object with items/data/employees');
    }

    return items.map((item, index) => toRecord(item, this.sourceSystem, index));
  }
}

export function isHttpEmployeeSyncConfigured(): boolean {
  return Boolean(env.EMPLOYEE_SYNC_ENABLED && env.EMPLOYEE_SYNC_BASE_URL);
}

export function createEmployeeProvider(): EmployeeProvider {
  if (!isHttpEmployeeSyncConfigured()) return new MockEmployeeProvider();

  return new HttpEmployeeProvider({
    baseUrl: env.EMPLOYEE_SYNC_BASE_URL!,
    path: env.EMPLOYEE_SYNC_PATH,
    sourceSystem: env.EMPLOYEE_SYNC_SOURCE_SYSTEM,
    authType: env.EMPLOYEE_SYNC_AUTH_TYPE,
    token: env.EMPLOYEE_SYNC_TOKEN,
    apiKeyHeader: env.EMPLOYEE_SYNC_API_KEY_HEADER,
    username: env.EMPLOYEE_SYNC_USERNAME,
    password: env.EMPLOYEE_SYNC_PASSWORD,
    timeoutMs: env.EMPLOYEE_SYNC_TIMEOUT_MS,
  });
}
