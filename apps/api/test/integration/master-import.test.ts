import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import readXlsxFile from 'read-excel-file/node';
import writeXlsxFile from 'write-excel-file/node';
import { MASTER_IMPORT_COLUMNS, type MasterImportEntity } from '@whoosh/shared';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const PREFIX = 'E2E-MI';
const DORM_CODE = `${PREFIX}-DORM`;

function binaryParser(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  res.on('data', (chunk: Buffer) => chunks.push(chunk));
  res.on('end', () => callback(null, Buffer.concat(chunks)));
}

async function buildWorkbook(
  entity: MasterImportEntity,
  rows: Array<Array<string | null>>,
): Promise<Buffer> {
  const file = await writeXlsxFile([[...MASTER_IMPORT_COLUMNS[entity]], ...rows], {
    sheet: 'Data',
  });
  return file.toBuffer();
}

function rowFor(
  entity: MasterImportEntity,
  values: Record<string, string | null>,
): Array<string | null> {
  return MASTER_IMPORT_COLUMNS[entity].map((column) => values[column] ?? null);
}

const bedValues = (overrides: Record<string, string | null> = {}) => ({
  dormitoryCode: DORM_CODE,
  buildingCode: 'B1',
  floorNumber: '1',
  roomNumber: '101',
  bedCode: 'BED-A',
  label: null,
  ...overrides,
});

const roomValues = (overrides: Record<string, string | null> = {}) => ({
  dormitoryCode: DORM_CODE,
  buildingCode: 'B1',
  floorNumber: '1',
  roomNumber: '102',
  roomTypeCode: 'DEMO-STD',
  name: null,
  genderPolicy: null,
  ...overrides,
});

const buildingValues = (overrides: Record<string, string | null> = {}) => ({
  dormitoryCode: DORM_CODE,
  code: 'B2',
  name: 'Gedung Uji B2',
  ...overrides,
});

const dormValues = (overrides: Record<string, string | null> = {}) => ({
  code: `${PREFIX}-DORM2`,
  name: 'Dormitori Uji Kedua',
  locationCode: 'HALIM',
  description: null,
  ...overrides,
});

const scratchFilter = {
  dormitory: { code: { startsWith: PREFIX } },
};

beforeAll(async () => {
  const location = await prisma.location.findUnique({ where: { code: 'HALIM' } });
  const roomType = await prisma.roomType.findUnique({ where: { code: 'DEMO-STD' } });
  if (!location || !roomType) throw new Error('Seed prerequisites missing');
  const dormitory = await prisma.dormitory.create({
    data: { code: DORM_CODE, name: 'Dormitori Uji Impor Master', locationId: location.id },
  });
  const building = await prisma.building.create({
    data: { dormitoryId: dormitory.id, code: 'B1', name: 'Gedung Uji B1' },
  });
  const floor = await prisma.floor.create({
    data: { buildingId: building.id, floorNumber: 1, name: 'Lantai 1' },
  });
  await prisma.room.create({
    data: { floorId: floor.id, roomNumber: '101', roomTypeId: roomType.id },
  });
});

afterEach(async () => {
  await prisma.bed.deleteMany({
    where: { room: { floor: { building: scratchFilter } } },
  });
  await prisma.room.deleteMany({
    where: { floor: { building: scratchFilter }, roomNumber: { not: '101' } },
  });
  await prisma.building.deleteMany({
    where: { ...scratchFilter, code: { not: 'B1' } },
  });
  await prisma.dormitory.deleteMany({
    where: { code: { startsWith: PREFIX, not: DORM_CODE } },
  });
  await prisma.masterImportBatch.deleteMany({
    where: { fileName: { startsWith: 'e2e-master' } },
  });
});

afterAll(async () => {
  await prisma.bed.deleteMany({
    where: { room: { floor: { building: scratchFilter } } },
  });
  await prisma.room.deleteMany({ where: { floor: { building: scratchFilter } } });
  await prisma.floor.deleteMany({ where: { building: scratchFilter } });
  await prisma.building.deleteMany({ where: scratchFilter });
  await prisma.dormitory.deleteMany({ where: { code: { startsWith: PREFIX } } });
  await prisma.masterImportBatch.deleteMany({
    where: { fileName: { startsWith: 'e2e-master' } },
  });
});

describe('master data Excel import', () => {
  it('serves per-entity templates with the exact column contract', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    for (const entity of ['dormitories', 'buildings', 'rooms', 'beds'] as const) {
      const response = await agent
        .get(`/api/v1/master-data/import-template?entity=${entity}`)
        .buffer(true)
        .parse(binaryParser);
      expect(response.status).toBe(200);
      expect(response.headers['content-disposition']).toContain(
        `whoosh-stay-${entity}-import-template.xlsx`,
      );
      const sheets = await readXlsxFile(response.body as Buffer);
      expect(sheets.map((sheet) => sheet.sheet)).toEqual(['Data', 'Petunjuk']);
      expect(sheets[0].data[0]).toEqual([...MASTER_IMPORT_COLUMNS[entity]]);
    }
    const invalid = await agent.get('/api/v1/master-data/import-template?entity=unknown');
    expect(invalid.status).toBe(400);
  });

  it('imports beds with per-row validation, transactional commit, history and audit', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.admin);
    const buffer = await buildWorkbook('beds', [
      rowFor('beds', bedValues()),
      rowFor('beds', bedValues()),
      rowFor('beds', bedValues({ roomNumber: '999' })),
      rowFor('beds', bedValues({ floorNumber: '9', bedCode: 'BED-F9' })),
      rowFor('beds', bedValues({ bedCode: 'BED BAD' })),
    ]);
    const preview = await agent
      .post('/api/v1/master-data/import/preview?entity=beds')
      .attach('file', buffer, 'e2e-master-beds.xlsx');
    expect(preview.status).toBe(201);
    const batch = preview.body.data.batch;
    expect(batch).toMatchObject({
      entity: 'beds',
      status: 'PREVIEWED',
      rowCount: 5,
      validCount: 1,
      invalidCount: 4,
    });
    const rows = preview.body.data.rows as Array<{ action: string; errors: string[] }>;
    expect(rows[0]).toMatchObject({ action: 'INSERT', errors: [] });
    expect(rows[1].errors.join(' ')).toContain('Duplikat dalam file');
    expect(rows[2].errors.join(' ')).toContain('roomNumber');
    expect(rows[3].errors.join(' ')).toContain('floorNumber');
    expect(rows[4].errors.join(' ')).toContain('bedCode');

    const commit = await agent.post(`/api/v1/master-data/import/${batch.id}/commit`);
    expect(commit.status).toBe(200);
    expect(commit.body.data).toMatchObject({ inserted: 1, updated: 0, skipped: 0 });
    expect(commit.body.data.batch.status).toBe('COMMITTED');

    const bed = await prisma.bed.findFirst({
      where: { bedCode: 'BED-A', room: { roomNumber: '101', floor: { building: scratchFilter } } },
    });
    expect(bed).toMatchObject({ status: 'ACTIVE', housekeepingStatus: 'READY' });

    const audit = await agent.get(
      `/api/v1/admin/audit-logs?actorUserId=${body.data.user.id}&action=MASTER_IMPORT_COMMIT&pageSize=10`,
    );
    expect(audit.status).toBe(200);
    expect(
      audit.body.data.items.some((item: { entityId: string }) => item.entityId === batch.id),
    ).toBe(true);

    const history = await agent.get('/api/v1/master-data/import/batches?entity=beds&pageSize=10');
    expect(history.status).toBe(200);
    expect(
      history.body.data.items.some((item: { id: string }) => item.id === batch.id),
    ).toBe(true);

    const detail = await agent.get(`/api/v1/master-data/import/batches/${batch.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.rows).toHaveLength(5);

    const secondCommit = await agent.post(`/api/v1/master-data/import/${batch.id}/commit`);
    expect(secondCommit.status).toBe(409);

    const update = await agent
      .post('/api/v1/master-data/import/preview?entity=beds')
      .attach(
        'file',
        await buildWorkbook('beds', [rowFor('beds', bedValues({ label: 'Dekat jendela' }))]),
        'e2e-master-beds-update.xlsx',
      );
    expect(update.status).toBe(201);
    expect(update.body.data.rows[0].action).toBe('UPDATE');
    const updateCommit = await agent.post(
      `/api/v1/master-data/import/${update.body.data.batch.id}/commit`,
    );
    expect(updateCommit.status).toBe(200);
    expect(updateCommit.body.data).toMatchObject({ inserted: 0, updated: 1 });
    const updatedBed = await prisma.bed.findFirst({
      where: { bedCode: 'BED-A', room: { roomNumber: '101', floor: { building: scratchFilter } } },
    });
    expect(updatedBed?.label).toBe('Dekat jendela');
  });

  it('imports rooms and rejects room-type changes on existing rooms', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const buffer = await buildWorkbook('rooms', [
      rowFor('rooms', roomValues()),
      rowFor('rooms', roomValues({ roomNumber: '101', roomTypeCode: 'DEMO-TWIN' })),
      rowFor('rooms', roomValues({ roomNumber: '104', roomTypeCode: 'TIPE-TIDAK-ADA' })),
    ]);
    const preview = await agent
      .post('/api/v1/master-data/import/preview?entity=rooms')
      .attach('file', buffer, 'e2e-master-rooms.xlsx');
    expect(preview.status).toBe(201);
    expect(preview.body.data.batch).toMatchObject({ validCount: 1, invalidCount: 2 });
    const rows = preview.body.data.rows as Array<{ action: string; errors: string[] }>;
    expect(rows[0].action).toBe('INSERT');
    expect(rows[1].errors.join(' ')).toContain('Perubahan tipe kamar');
    expect(rows[2].errors.join(' ')).toContain('roomTypeCode');

    const commit = await agent.post(`/api/v1/master-data/import/${preview.body.data.batch.id}/commit`);
    expect(commit.status).toBe(200);
    expect(commit.body.data.inserted).toBe(1);
    const room = await prisma.room.findFirst({
      where: { roomNumber: '102', floor: { building: scratchFilter } },
    });
    expect(room).toMatchObject({
      operationalStatus: 'ACTIVE',
      housekeepingStatus: 'READY',
      genderPolicy: 'UNSPECIFIED',
    });

    const update = await agent
      .post('/api/v1/master-data/import/preview?entity=rooms')
      .attach(
        'file',
        await buildWorkbook('rooms', [
          rowFor('rooms', roomValues({ name: 'Kamar Uji 102', genderPolicy: 'FEMALE' })),
        ]),
        'e2e-master-rooms-update.xlsx',
      );
    expect(update.status).toBe(201);
    expect(update.body.data.rows[0].action).toBe('UPDATE');
    const updateCommit = await agent.post(
      `/api/v1/master-data/import/${update.body.data.batch.id}/commit`,
    );
    expect(updateCommit.body.data).toMatchObject({ inserted: 0, updated: 1 });
    const updated = await prisma.room.findFirst({
      where: { roomNumber: '102', floor: { building: scratchFilter } },
    });
    expect(updated).toMatchObject({ name: 'Kamar Uji 102', genderPolicy: 'FEMALE' });
  });

  it('imports buildings and dormitories with parent and location validation', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const buildings = await agent
      .post('/api/v1/master-data/import/preview?entity=buildings')
      .attach(
        'file',
        await buildWorkbook('buildings', [
          rowFor('buildings', buildingValues()),
          rowFor('buildings', buildingValues({ code: 'B1', name: 'Gedung Uji B1 Diperbarui' })),
          rowFor('buildings', buildingValues({ dormitoryCode: 'DORM-TIDAK-ADA', code: 'BX' })),
        ]),
        'e2e-master-buildings.xlsx',
      );
    expect(buildings.status).toBe(201);
    expect(buildings.body.data.batch).toMatchObject({ validCount: 2, invalidCount: 1 });
    expect(buildings.body.data.rows[0].action).toBe('INSERT');
    expect(buildings.body.data.rows[1].action).toBe('UPDATE');
    expect(buildings.body.data.rows[2].errors.join(' ')).toContain('dormitoryCode');
    const buildingCommit = await agent.post(
      `/api/v1/master-data/import/${buildings.body.data.batch.id}/commit`,
    );
    expect(buildingCommit.body.data).toMatchObject({ inserted: 1, updated: 1 });
    const renamed = await prisma.building.findFirst({
      where: { code: 'B1', dormitory: { code: DORM_CODE } },
    });
    expect(renamed?.name).toBe('Gedung Uji B1 Diperbarui');

    const dorms = await agent
      .post('/api/v1/master-data/import/preview?entity=dormitories')
      .attach(
        'file',
        await buildWorkbook('dormitories', [
          rowFor('dormitories', dormValues()),
          rowFor('dormitories', dormValues({ code: `${PREFIX}-DORM3`, locationCode: 'LOKASI-HANTU' })),
        ]),
        'e2e-master-dorms.xlsx',
      );
    expect(dorms.status).toBe(201);
    expect(dorms.body.data.batch).toMatchObject({ validCount: 1, invalidCount: 1 });
    expect(dorms.body.data.rows[1].errors.join(' ')).toContain('master lokasi');
    const dormCommit = await agent.post(
      `/api/v1/master-data/import/${dorms.body.data.batch.id}/commit`,
    );
    expect(dormCommit.body.data.inserted).toBe(1);
    const created = await prisma.dormitory.findUnique({ where: { code: `${PREFIX}-DORM2` } });
    expect(created?.name).toBe('Dormitori Uji Kedua');
    expect(created?.locationId).toBeTruthy();
  });

  it('revalidates references inside the commit transaction', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const roomType = await prisma.roomType.findUnique({ where: { code: 'DEMO-STD' } });
    const floor = await prisma.floor.findFirst({
      where: { floorNumber: 1, building: scratchFilter },
    });
    const transient = await prisma.room.create({
      data: { floorId: floor!.id, roomNumber: '103', roomTypeId: roomType!.id },
    });
    const preview = await agent
      .post('/api/v1/master-data/import/preview?entity=beds')
      .attach(
        'file',
        await buildWorkbook('beds', [rowFor('beds', bedValues({ roomNumber: '103', bedCode: 'BED-T' }))]),
        'e2e-master-revalidate.xlsx',
      );
    expect(preview.status).toBe(201);
    expect(preview.body.data.rows[0].action).toBe('INSERT');
    await prisma.room.delete({ where: { id: transient.id } });

    const commit = await agent.post(
      `/api/v1/master-data/import/${preview.body.data.batch.id}/commit`,
    );
    expect(commit.status).toBe(200);
    expect(commit.body.data).toMatchObject({ inserted: 0, updated: 0, skipped: 1 });
    expect(commit.body.data.batch.invalidCount).toBe(1);
    expect(commit.body.data.batch.errorSummary).toContain('roomNumber');
  });

  it('rejects malformed files and enforces permissions', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const notExcel = await agent
      .post('/api/v1/master-data/import/preview?entity=beds')
      .attach('file', Buffer.from('not excel'), 'e2e-master-bad.xlsx');
    expect(notExcel.status).toBe(415);

    const wrongHeader = await writeXlsxFile([['kode'], ['X']], { sheet: 'Data' });
    const badHeader = await agent
      .post('/api/v1/master-data/import/preview?entity=beds')
      .attach('file', await wrongHeader.toBuffer(), 'e2e-master-bad.xlsx');
    expect(badHeader.status).toBe(400);

    const empty = await writeXlsxFile([[...MASTER_IMPORT_COLUMNS.beds]], { sheet: 'Data' });
    const emptyResponse = await agent
      .post('/api/v1/master-data/import/preview?entity=beds')
      .attach('file', await empty.toBuffer(), 'e2e-master-bad.xlsx');
    expect(emptyResponse.status).toBe(400);

    const missingFile = await agent.post('/api/v1/master-data/import/preview?entity=beds');
    expect(missingFile.status).toBe(400);

    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const deniedTemplate = await crew.agent.get('/api/v1/master-data/import-template?entity=beds');
    expect([401, 403]).toContain(deniedTemplate.status);
    const deniedPreview = await crew.agent
      .post('/api/v1/master-data/import/preview?entity=beds')
      .attach('file', await buildWorkbook('beds', [rowFor('beds', bedValues())]), 'e2e-master-denied.xlsx');
    expect([401, 403]).toContain(deniedPreview.status);
    const deniedHistory = await crew.agent.get('/api/v1/master-data/import/batches');
    expect([401, 403]).toContain(deniedHistory.status);

    const unknownBatch = await agent.post(
      '/api/v1/master-data/import/00000000-0000-0000-0000-000000000000/commit',
    );
    expect(unknownBatch.status).toBe(404);
  });
});