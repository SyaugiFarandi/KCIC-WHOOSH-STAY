import { afterEach, describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { EMPLOYEE_IMPORT_COLUMNS } from '@whoosh/shared';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const TEST_PREFIX = 'E2E-IMP';

function binaryParser(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function buildWorkbook(rows: Array<Array<string | null>>): Promise<Buffer> {
  const file = await writeXlsxFile(
    [[...EMPLOYEE_IMPORT_COLUMNS], ...rows],
    { sheet: 'Data' },
  );
  return file.toBuffer();
}

function employeeRow(overrides: Partial<Record<string, string>> = {}): Array<string | null> {
  const values: Record<string, string | null> = {
    employeeCode: `${TEST_PREFIX}-001`,
    fullName: 'Karyawan Uji Impor Satu',
    employmentStatus: 'ACTIVE',
    workEmail: null,
    departmentCode: null,
    departmentName: null,
    positionCode: null,
    positionName: null,
    homeStationCode: 'HALIM',
    ...overrides,
  };
  return EMPLOYEE_IMPORT_COLUMNS.map((column) => values[column] ?? null);
}

afterEach(async () => {
  await prisma.employee.deleteMany({
    where: { sourceSystem: 'IMPORT', employeeCode: { startsWith: TEST_PREFIX } },
  });
  await prisma.employeeImportBatch.deleteMany({
    where: { fileName: { startsWith: 'e2e-import' } },
  });
});

describe('employee Excel import', () => {
  it('serves a template with the exact column contract and a guide sheet', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const response = await agent
      .get('/api/v1/employees/import-template')
      .buffer(true)
      .parse(binaryParser);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('spreadsheetml');
    expect(response.headers['content-disposition']).toContain(
      'whoosh-stay-employee-import-template.xlsx',
    );

    const sheets = await readXlsxFile(response.body as Buffer);
    expect(sheets.map((sheet) => sheet.sheet)).toEqual(['Data', 'Petunjuk']);
    expect(sheets[0].data[0]).toEqual([...EMPLOYEE_IMPORT_COLUMNS]);
    expect(sheets[1].data.length).toBeGreaterThan(5);
  });

  it('previews with per-row errors, commits in a transaction and records history + audit', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.admin);
    const buffer = await buildWorkbook([
      employeeRow(),
      employeeRow({
        employeeCode: `${TEST_PREFIX}-002`,
        fullName: 'Karyawan Uji Impor Dua',
        workEmail: 'bukan-email',
      }),
      employeeRow({ fullName: 'Duplikat dalam file' }),
      employeeRow({
        employeeCode: `${TEST_PREFIX}-003`,
        fullName: 'Karyawan Uji Impor Tiga',
        homeStationCode: 'LOKASI-TIDAK-ADA',
      }),
      employeeRow({
        employeeCode: `${TEST_PREFIX}-004`,
        fullName: 'Karyawan Uji Impor Empat',
        employmentStatus: 'PENSIONED',
      }),
    ]);

    const preview = await agent
      .post('/api/v1/employees/import/preview')
      .attach('file', buffer, 'e2e-import-preview.xlsx');
    expect(preview.status).toBe(201);
    const batch = preview.body.data.batch;
    expect(batch).toMatchObject({
      status: 'PREVIEWED',
      rowCount: 5,
      validCount: 1,
      invalidCount: 4,
      fileName: 'e2e-import-preview.xlsx',
    });
    const rows = preview.body.data.rows as Array<{
      rowNumber: number;
      action: string;
      errors: string[];
    }>;
    expect(rows[0]).toMatchObject({ rowNumber: 2, action: 'INSERT', errors: [] });
    expect(rows[1].action).toBe('INVALID');
    expect(rows[1].errors.join(' ')).toContain('workEmail');
    expect(rows[2].errors.join(' ')).toContain('duplikat');
    expect(rows[3].errors.join(' ')).toContain('master lokasi');
    expect(rows[4].errors.join(' ')).toContain('employmentStatus');

    const commit = await agent.post(`/api/v1/employees/import/${batch.id}/commit`);
    expect(commit.status).toBe(200);
    expect(commit.body.data).toMatchObject({ inserted: 1, updated: 0, skipped: 0 });
    expect(commit.body.data.batch.status).toBe('COMMITTED');

    const employee = await prisma.employee.findUnique({
      where: {
        sourceSystem_externalEmployeeId: {
          sourceSystem: 'IMPORT',
          externalEmployeeId: `${TEST_PREFIX}-001`,
        },
      },
    });
    expect(employee).toMatchObject({
      fullName: 'Karyawan Uji Impor Satu',
      homeStationCode: 'HALIM',
      employmentStatus: 'ACTIVE',
      eligibilityStatus: 'UNKNOWN',
    });
    expect(employee?.syncedAt).toBeTruthy();

    const syncRun = await prisma.employeeSyncLog.findUnique({
      where: { id: commit.body.data.syncRunId },
    });
    expect(syncRun).toMatchObject({
      sourceSystem: 'IMPORT',
      status: 'PARTIAL',
      fetchedCount: 5,
      insertedCount: 1,
      failedCount: 4,
      initiatedBy: body.data.user.id,
    });

    const audit = await agent.get(
      `/api/v1/admin/audit-logs?actorUserId=${body.data.user.id}&action=EMPLOYEE_IMPORT_COMMIT&pageSize=10`,
    );
    expect(audit.status).toBe(200);
    expect(
      audit.body.data.items.some((item: { entityId: string }) => item.entityId === batch.id),
    ).toBe(true);

    const history = await agent.get('/api/v1/employees/import/batches?pageSize=10');
    expect(history.status).toBe(200);
    expect(
      history.body.data.items.some((item: { id: string }) => item.id === batch.id),
    ).toBe(true);

    const detail = await agent.get(`/api/v1/employees/import/batches/${batch.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.rows).toHaveLength(5);
    expect(detail.body.data.rows[0].action).toBe('INSERT');

    const secondCommit = await agent.post(`/api/v1/employees/import/${batch.id}/commit`);
    expect(secondCommit.status).toBe(409);
  });

  it('marks re-imported codes as UPDATE and refreshes existing records', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const first = await agent
      .post('/api/v1/employees/import/preview')
      .attach('file', await buildWorkbook([employeeRow()]), 'e2e-import-update.xlsx');
    expect(first.status).toBe(201);
    expect(first.body.data.rows[0].action).toBe('INSERT');
    const firstCommit = await agent.post(
      `/api/v1/employees/import/${first.body.data.batch.id}/commit`,
    );
    expect(firstCommit.status).toBe(200);
    expect(firstCommit.body.data.inserted).toBe(1);

    const second = await agent
      .post('/api/v1/employees/import/preview')
      .attach(
        'file',
        await buildWorkbook([
          employeeRow({ fullName: 'Karyawan Uji Impor Diperbarui', employmentStatus: 'INACTIVE' }),
        ]),
        'e2e-import-update.xlsx',
      );
    expect(second.status).toBe(201);
    expect(second.body.data.rows[0].action).toBe('UPDATE');
    const secondCommit = await agent.post(
      `/api/v1/employees/import/${second.body.data.batch.id}/commit`,
    );
    expect(secondCommit.status).toBe(200);
    expect(secondCommit.body.data).toMatchObject({ inserted: 0, updated: 1 });

    const employee = await prisma.employee.findUnique({
      where: {
        sourceSystem_externalEmployeeId: {
          sourceSystem: 'IMPORT',
          externalEmployeeId: `${TEST_PREFIX}-001`,
        },
      },
    });
    expect(employee).toMatchObject({
      fullName: 'Karyawan Uji Impor Diperbarui',
      employmentStatus: 'INACTIVE',
    });
  });

  it('rejects codes already owned by another source system', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const buffer = await buildWorkbook([
      employeeRow({ employeeCode: 'DEMO-EMP-0001', fullName: 'Tabrakan sumber DEMO' }),
    ]);
    const preview = await agent
      .post('/api/v1/employees/import/preview')
      .attach('file', buffer, 'e2e-import-conflict.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.data.batch.validCount).toBe(0);
    expect(preview.body.data.rows[0].errors.join(' ')).toContain('sumber lain');

    const commit = await agent.post(
      `/api/v1/employees/import/${preview.body.data.batch.id}/commit`,
    );
    expect(commit.status).toBe(400);
  });

  it('rejects malformed files and enforces permissions', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const notExcel = await agent
      .post('/api/v1/employees/import/preview')
      .attach('file', Buffer.from('this is not excel'), 'e2e-import-bad.xlsx');
    expect(notExcel.status).toBe(415);

    const wrongHeader = await writeXlsxFile([['kode', 'nama'], ['X', 'Y']], { sheet: 'Data' });
    const badHeader = await agent
      .post('/api/v1/employees/import/preview')
      .attach('file', await wrongHeader.toBuffer(), 'e2e-import-bad.xlsx');
    expect(badHeader.status).toBe(400);
    expect(badHeader.body.error.code).toBe('VALIDATION_ERROR');

    const empty = await writeXlsxFile([[...EMPLOYEE_IMPORT_COLUMNS]], { sheet: 'Data' });
    const emptyResponse = await agent
      .post('/api/v1/employees/import/preview')
      .attach('file', await empty.toBuffer(), 'e2e-import-bad.xlsx');
    expect(emptyResponse.status).toBe(400);

    const missingFile = await agent.post('/api/v1/employees/import/preview');
    expect(missingFile.status).toBe(400);

    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const deniedTemplate = await crew.agent.get('/api/v1/employees/import-template');
    expect([401, 403]).toContain(deniedTemplate.status);
    const deniedPreview = await crew.agent
      .post('/api/v1/employees/import/preview')
      .attach('file', await buildWorkbook([employeeRow()]), 'e2e-import-denied.xlsx');
    expect([401, 403]).toContain(deniedPreview.status);
    const deniedHistory = await crew.agent.get('/api/v1/employees/import/batches');
    expect([401, 403]).toContain(deniedHistory.status);

    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const deniedManager = await manager.agent.get('/api/v1/employees/import/batches');
    expect([401, 403]).toContain(deniedManager.status);

    const unknownBatch = await agent.post(
      '/api/v1/employees/import/00000000-0000-0000-0000-000000000000/commit',
    );
    expect(unknownBatch.status).toBe(404);
  });
});