import { afterEach, describe, expect, it } from 'vitest';
import writeXlsxFile from 'write-excel-file/node';
import { EMPLOYEE_IMPORT_COLUMNS } from '@whoosh/shared';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const PREFIX = 'E2E-SYN';
const SOURCE = 'SYNTHETIC';

async function createSyntheticEmployees() {
  const departmentCode = `${PREFIX}-DEP`;
  await prisma.orgReference.upsert({
    where: { type_code: { type: 'DEPARTMENT', code: departmentCode } },
    update: { name: 'Departemen Uji Sintetis' },
    create: {
      type: 'DEPARTMENT',
      code: departmentCode,
      name: 'Departemen Uji Sintetis',
      status: 'UNCONFIRMED',
      sourceSystem: SOURCE,
    },
  });

  const supervisor = await prisma.employee.create({
    data: {
      sourceSystem: SOURCE,
      externalEmployeeId: `${PREFIX}-0001`,
      employeeCode: `${PREFIX}-0001`,
      fullName: 'Supervisor Uji Sintetis',
      workEmail: `${PREFIX.toLowerCase()}-0001@example.invalid`,
      departmentCode,
      departmentName: 'Departemen Uji Sintetis',
      divisionCode: `${PREFIX}-DIV`,
      divisionName: 'Divisi Uji Sintetis',
      positionCode: `${PREFIX}-SPV`,
      positionName: 'Supervisor Uji',
      homeStationCode: 'HALIM',
      joinDate: new Date('2020-02-01T00:00:00.000Z'),
      employmentStatus: 'ACTIVE',
    },
  });
  const staff = await prisma.employee.create({
    data: {
      sourceSystem: SOURCE,
      externalEmployeeId: `${PREFIX}-0002`,
      employeeCode: `${PREFIX}-0002`,
      fullName: 'Staf Uji Sintetis',
      workEmail: `${PREFIX.toLowerCase()}-0002@example.invalid`,
      departmentCode,
      departmentName: 'Departemen Uji Sintetis',
      divisionCode: `${PREFIX}-DIV`,
      divisionName: 'Divisi Uji Sintetis',
      positionCode: `${PREFIX}-STAF`,
      positionName: 'Staf Uji',
      homeStationCode: 'KARAWANG',
      joinDate: new Date('2021-03-15T00:00:00.000Z'),
      employmentStatus: 'ACTIVE',
      supervisorId: supervisor.id,
    },
  });
  return { supervisor, staff, departmentCode };
}

afterEach(async () => {
  await prisma.employee.deleteMany({
    where: { sourceSystem: SOURCE, employeeCode: { startsWith: PREFIX } },
  });
  await prisma.orgReference.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.employeeImportBatch.deleteMany({
    where: { fileName: { startsWith: 'e2e-syn' } },
  });
});

describe('synthetic employee API surface', () => {
  it('filters by location, department, division, position and source', async () => {
    const { departmentCode } = await createSyntheticEmployees();
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const byLocation = await agent.get(
      `/api/v1/employees?homeStationCode=KARAWANG&sourceSystem=${SOURCE}&q=${PREFIX}`,
    );
    expect(byLocation.status).toBe(200);
    expect(byLocation.body.data.items).toHaveLength(1);
    expect(byLocation.body.data.items[0].employeeCode).toBe(`${PREFIX}-0002`);

    const byDepartment = await agent.get(
      `/api/v1/employees?departmentCode=${departmentCode}&sourceSystem=${SOURCE}`,
    );
    expect(byDepartment.body.data.pagination.total).toBe(2);

    const byDivision = await agent.get(
      `/api/v1/employees?divisionCode=${PREFIX}-DIV&sourceSystem=${SOURCE}`,
    );
    expect(byDivision.body.data.pagination.total).toBe(2);

    const byPosition = await agent.get(
      `/api/v1/employees?positionCode=${PREFIX}-SPV&sourceSystem=${SOURCE}`,
    );
    expect(byPosition.body.data.pagination.total).toBe(1);
    expect(byPosition.body.data.items[0].fullName).toBe('Supervisor Uji Sintetis');

    const searchDivision = await agent.get(
      `/api/v1/employees?q=Divisi Uji Sintetis&sourceSystem=${SOURCE}`,
    );
    expect(searchDivision.body.data.pagination.total).toBe(2);
  });

  it('returns detail with supervisor relation, subordinate count and join date', async () => {
    const { supervisor, staff } = await createSyntheticEmployees();
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const detail = await agent.get(`/api/v1/employees/${staff.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      employeeCode: `${PREFIX}-0002`,
      divisionName: 'Divisi Uji Sintetis',
      joinDate: '2021-03-15',
      sourceSystem: SOURCE,
      subordinateCount: 0,
    });
    expect(detail.body.data.supervisor).toMatchObject({
      id: supervisor.id,
      employeeCode: `${PREFIX}-0001`,
      fullName: 'Supervisor Uji Sintetis',
    });

    const supervisorDetail = await agent.get(`/api/v1/employees/${supervisor.id}`);
    expect(supervisorDetail.body.data.subordinateCount).toBe(1);
    expect(supervisorDetail.body.data.supervisor).toBeNull();

    const missing = await agent.get('/api/v1/employees/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);
    const malformed = await agent.get('/api/v1/employees/bukan-uuid');
    expect(malformed.status).toBe(400);
  });

  it('exposes provenance and location distribution in summary and filter options', async () => {
    const { departmentCode } = await createSyntheticEmployees();
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const summary = await agent.get('/api/v1/employees/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data.bySource[SOURCE]).toBeGreaterThanOrEqual(2);
    expect(summary.body.data.byLocation.HALIM).toBeGreaterThanOrEqual(1);
    expect(summary.body.data.byLocation.KARAWANG).toBeGreaterThanOrEqual(1);

    const options = await agent.get('/api/v1/employees/filter-options');
    expect(options.status).toBe(200);
    expect(options.body.data.locations.some((l: { code: string }) => l.code === 'HALIM')).toBe(true);
    const department = options.body.data.departments.find(
      (d: { code: string }) => d.code === departmentCode,
    );
    expect(department).toMatchObject({ name: 'Departemen Uji Sintetis', status: 'UNCONFIRMED' });
    expect(options.body.data.sources).toContain(SOURCE);
  });

  it('blocks official import from overwriting synthetic codes (replacement safety)', async () => {
    await createSyntheticEmployees();
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const values: Record<string, string | null> = {
      employeeCode: `${PREFIX}-0001`,
      fullName: 'Pengganti Resmi Tidak Valid',
      employmentStatus: 'ACTIVE',
      workEmail: null,
      departmentCode: null,
      departmentName: null,
      positionCode: null,
      positionName: null,
      homeStationCode: 'HALIM',
    };
    const file = await writeXlsxFile(
      [[...EMPLOYEE_IMPORT_COLUMNS], EMPLOYEE_IMPORT_COLUMNS.map((c) => values[c] ?? null)],
      { sheet: 'Data' },
    );
    const preview = await agent
      .post('/api/v1/employees/import/preview')
      .attach('file', await file.toBuffer(), 'e2e-syn-conflict.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.data.batch.validCount).toBe(0);
    expect(preview.body.data.rows[0].errors.join(' ')).toContain('sumber lain (SYNTHETIC)');

    const commit = await agent.post(
      `/api/v1/employees/import/${preview.body.data.batch.id}/commit`,
    );
    expect(commit.status).toBe(400);

    const unchanged = await prisma.employee.findUnique({
      where: {
        sourceSystem_externalEmployeeId: {
          sourceSystem: SOURCE,
          externalEmployeeId: `${PREFIX}-0001`,
        },
      },
    });
    expect(unchanged?.fullName).toBe('Supervisor Uji Sintetis');
  });

  it('enforces employees.read permission on list, detail and options', async () => {
    const { staff } = await createSyntheticEmployees();
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const list = await crew.agent.get('/api/v1/employees');
    expect([401, 403]).toContain(list.status);
    const detail = await crew.agent.get(`/api/v1/employees/${staff.id}`);
    expect([401, 403]).toContain(detail.status);
    const options = await crew.agent.get('/api/v1/employees/filter-options');
    expect([401, 403]).toContain(options.status);
  });
});