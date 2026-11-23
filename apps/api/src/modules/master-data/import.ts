import { Router } from 'express';
import { z } from 'zod';
import writeXlsxFile from 'write-excel-file/node';
import {
  MASTER_IMPORT_COLUMNS,
  MASTER_IMPORT_ENTITIES,
  MASTER_IMPORT_MAX_ROWS,
  masterBedImportRowSchema,
  masterBuildingImportRowSchema,
  masterDormitoryImportRowSchema,
  masterRoomImportRowSchema,
  paginationQuerySchema,
  type ImportBatchSummary,
  type ImportCommitResult,
  type ImportPreview,
  type ImportPreviewRow,
  type ImportRowAction,
  type MasterImportEntity,
  type PaginationMeta,
} from '@whoosh/shared';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import {
  createImportUpload,
  parseImportWorkbook,
  schemaErrors,
  toImportInput,
  type RawImportRow,
} from '../../lib/xlsx-import.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../middleware/errors.js';
import { requireAnyPermission, requireAuth } from '../auth/middleware.js';
import { hasPermission, resolveAccessScope, type Principal } from '../auth/types.js';
import { writeAudit } from '../audit/audit.js';

export const masterImportRouter = Router();

const batchIdSchema = z.uuid();
const entitySchema = z.enum(MASTER_IMPORT_ENTITIES);
const uploadSingle = createImportUpload();

type Tx = Prisma.TransactionClient;

interface EntityConfig {
  label: string;
  permission: 'dormitories.create' | 'buildings.manage' | 'rooms.create' | 'beds.manage';
  schema: z.ZodType<Record<string, unknown>>;
  uppercase: string[];
  guide: Array<[string, string]>;
}

const CONFIG: Record<MasterImportEntity, EntityConfig> = {
  dormitories: {
    label: 'unit akomodasi',
    permission: 'dormitories.create',
    schema: masterDormitoryImportRowSchema as unknown as z.ZodType<Record<string, unknown>>,
    uppercase: ['code', 'locationCode'],
    guide: [
      ['code', 'Wajib. 2-40 karakter huruf/angka/tanda hubung. Kode yang sudah ada akan diperbarui.'],
      ['name', 'Wajib. 2-150 karakter.'],
      ['locationCode', 'Opsional. Harus cocok dengan kode master lokasi yang aktif (mis. HALIM). Kosongkan bila belum diverifikasi.'],
      ['description', 'Opsional. Maksimal 2000 karakter.'],
      ['Aturan', 'Impor tidak mengubah status dormitory. Alamat, kontak, dan koordinat tidak diimpor lewat Excel.'],
    ],
  },
  buildings: {
    label: 'gedung',
    permission: 'buildings.manage',
    schema: masterBuildingImportRowSchema as unknown as z.ZodType<Record<string, unknown>>,
    uppercase: ['dormitoryCode', 'code'],
    guide: [
      ['dormitoryCode', 'Wajib. Harus cocok dengan kode dormitory yang sudah ada.'],
      ['code', 'Wajib. Unik per dormitory. Kode yang sudah ada akan diperbarui namanya.'],
      ['name', 'Wajib. 2-150 karakter.'],
      ['Aturan', 'Gedung tidak dibuat otomatis untuk dormitory yang belum ada; buat unit akomodasi terlebih dahulu.'],
    ],
  },
  rooms: {
    label: 'kamar',
    permission: 'rooms.create',
    schema: masterRoomImportRowSchema as unknown as z.ZodType<Record<string, unknown>>,
    uppercase: ['dormitoryCode', 'buildingCode', 'roomTypeCode'],
    guide: [
      ['dormitoryCode', 'Wajib. Harus cocok dengan kode dormitory yang sudah ada.'],
      ['buildingCode', 'Wajib. Harus cocok dengan kode gedung di dormitory tersebut.'],
      ['floorNumber', 'Wajib. Bilangan bulat -5..100. Lantai harus sudah dibuat melalui form gedung.'],
      ['roomNumber', 'Wajib. Unik per lantai. Kamar yang sudah ada hanya diperbarui nama/kebijakan gender.'],
      ['roomTypeCode', 'Wajib. Harus cocok dengan kode tipe kamar yang sudah ada. Perubahan tipe kamar existing ditolak.'],
      ['name', 'Opsional. Maksimal 100 karakter.'],
      ['genderPolicy', 'Opsional. UNSPECIFIED, MALE, atau FEMALE. Default UNSPECIFIED.'],
      ['Aturan', 'Kamar baru dibuat dengan status operasional ACTIVE dan kesiapan READY. Kapasitas mengikuti tipe kamar.'],
    ],
  },
  beds: {
    label: 'tempat tidur',
    permission: 'beds.manage',
    schema: masterBedImportRowSchema as unknown as z.ZodType<Record<string, unknown>>,
    uppercase: ['dormitoryCode', 'buildingCode', 'bedCode'],
    guide: [
      ['dormitoryCode', 'Wajib. Harus cocok dengan kode dormitory yang sudah ada.'],
      ['buildingCode', 'Wajib. Harus cocok dengan kode gedung di dormitory tersebut.'],
      ['floorNumber', 'Wajib. Bilangan bulat -5..100 dan lantai harus sudah ada.'],
      ['roomNumber', 'Wajib. Kamar harus sudah ada di lantai tersebut.'],
      ['bedCode', 'Wajib. Unik per kamar. Bed yang sudah ada hanya diperbarui labelnya.'],
      ['label', 'Opsional. Maksimal 80 karakter.'],
      ['Aturan', 'Bed baru dibuat ACTIVE/READY. Status operasional dan kesiapan dikelola melalui modul operasional, bukan impor.'],
    ],
  },
};

const MASTER_IMPORT_PERMISSIONS = [
  'dormitories.create',
  'buildings.manage',
  'rooms.create',
  'beds.manage',
] as const;

function requireEntityPermission(req: { auth?: Principal }, entity: MasterImportEntity): void {
  if (!req.auth || !hasPermission(req.auth, CONFIG[entity].permission)) {
    throw new ForbiddenError(`Import ${CONFIG[entity].label} requires ${CONFIG[entity].permission}`);
  }
}

function requireGlobalScope(req: { access?: { global: boolean } }, entity: MasterImportEntity): void {
  if (!req.access?.global) {
    throw new ForbiddenError(`Import ${CONFIG[entity].label} requires global scope`);
  }
}

function toBatchSummary(batch: {
  id: string;
  entity: string;
  fileName: string;
  status: string;
  rowCount: number;
  validCount: number;
  invalidCount: number;
  insertedCount: number;
  updatedCount: number;
  errorSummary: string | null;
  uploadedBy: string | null;
  committedBy: string | null;
  createdAt: Date;
  committedAt: Date | null;
}): ImportBatchSummary {
  return {
    id: batch.id,
    entity: batch.entity,
    fileName: batch.fileName,
    status: batch.status,
    rowCount: batch.rowCount,
    validCount: batch.validCount,
    invalidCount: batch.invalidCount,
    insertedCount: batch.insertedCount,
    updatedCount: batch.updatedCount,
    errorSummary: batch.errorSummary,
    uploadedBy: batch.uploadedBy,
    committedBy: batch.committedBy,
    createdAt: batch.createdAt.toISOString(),
    committedAt: batch.committedAt?.toISOString() ?? null,
  };
}

interface Chain {
  dormitory: { id: string; code: string } | null;
  building: { id: string; code: string } | null;
  floor: { id: string; floorNumber: number } | null;
  room: { id: string; roomNumber: string; roomTypeId: string; roomTypeCode: string } | null;
}

async function resolveChain(
  client: Tx | typeof prisma,
  input: Record<string, unknown>,
  errors: string[],
  requireRoom = false,
): Promise<Chain> {
  const chain: Chain = { dormitory: null, building: null, floor: null, room: null };
  const dormitoryCode = input.dormitoryCode as string | undefined;
  if (dormitoryCode) {
    chain.dormitory = await client.dormitory.findUnique({
      where: { code: dormitoryCode },
      select: { id: true, code: true },
    });
    if (!chain.dormitory) {
      errors.push(`dormitoryCode: Dormitory ${dormitoryCode} tidak ditemukan.`);
    }
  }
  const buildingCode = input.buildingCode as string | undefined;
  if (buildingCode && chain.dormitory) {
    chain.building = await client.building.findUnique({
      where: { dormitoryId_code: { dormitoryId: chain.dormitory.id, code: buildingCode } },
      select: { id: true, code: true },
    });
    if (!chain.building) {
      errors.push(`buildingCode: Gedung ${buildingCode} tidak ditemukan di dormitory ${dormitoryCode}.`);
    }
  }
  const floorNumber = input.floorNumber as number | undefined;
  if (floorNumber !== undefined && chain.building) {
    chain.floor = await client.floor.findUnique({
      where: { buildingId_floorNumber: { buildingId: chain.building.id, floorNumber } },
      select: { id: true, floorNumber: true },
    });
    if (!chain.floor) {
      errors.push(
        `floorNumber: Lantai ${floorNumber} belum ada di gedung ${buildingCode}. Buat lantai melalui form terlebih dahulu.`,
      );
    }
  }
  const roomNumber = input.roomNumber as string | undefined;
  if (roomNumber && chain.floor) {
    const room = await client.room.findUnique({
      where: { floorId_roomNumber: { floorId: chain.floor.id, roomNumber } },
      select: { id: true, roomNumber: true, roomTypeId: true, roomType: { select: { code: true } } },
    });
    chain.room = room
      ? { id: room.id, roomNumber: room.roomNumber, roomTypeId: room.roomTypeId, roomTypeCode: room.roomType.code }
      : null;
    if (!chain.room && requireRoom) {
      errors.push(`roomNumber: Kamar ${roomNumber} tidak ditemukan di lantai ${floorNumber}.`);
    }
  }
  return chain;
}

function duplicateKey(entity: MasterImportEntity, input: Record<string, unknown>): string {
  switch (entity) {
    case 'dormitories':
      return String(input.code);
    case 'buildings':
      return `${input.dormitoryCode}|${input.code}`;
    case 'rooms':
      return `${input.dormitoryCode}|${input.buildingCode}|${input.floorNumber}|${input.roomNumber}`;
    case 'beds':
      return `${input.dormitoryCode}|${input.buildingCode}|${input.floorNumber}|${input.roomNumber}|${input.bedCode}`;
  }
}

async function analyzeRows(
  entity: MasterImportEntity,
  dataRows: RawImportRow[],
): Promise<ImportPreviewRow[]> {
  const config = CONFIG[entity];
  const parsedRows = dataRows.map(({ rowNumber, raw }) => {
    const input = toImportInput(raw, MASTER_IMPORT_COLUMNS[entity], config.uppercase);
    const parsed = config.schema.safeParse(input);
    return {
      rowNumber,
      raw,
      input: (parsed.success ? parsed.data : input) as Record<string, unknown>,
      errors: schemaErrors(parsed),
    };
  });

  const codes = (column: string): string[] =>
    parsedRows
      .map((row) => row.input[column])
      .filter((value): value is string => typeof value === 'string');

  const [dormitories, locations, roomTypes] = await Promise.all([
    codes('dormitoryCode').length || entity === 'dormitories'
      ? prisma.dormitory.findMany({
          where: { code: { in: [...codes('dormitoryCode'), ...codes('code')] } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
    entity === 'dormitories' && codes('locationCode').length
      ? prisma.location.findMany({
          where: { code: { in: codes('locationCode') } },
          select: { code: true, status: true },
        })
      : Promise.resolve([]),
    entity === 'rooms' && codes('roomTypeCode').length
      ? prisma.roomType.findMany({
          where: { code: { in: codes('roomTypeCode') } },
          select: { id: true, code: true },
        })
      : Promise.resolve([]),
  ]);
  const dormitoryByCode = new Map(dormitories.map((dormitory) => [dormitory.code, dormitory.id]));
  const locationByCode = new Map(locations.map((location) => [location.code, location.status]));
  const roomTypeByCode = new Map(roomTypes.map((roomType) => [roomType.code, roomType.id]));

  const dormitoryIds = [...dormitoryByCode.values()];
  const buildings = dormitoryIds.length
    ? await prisma.building.findMany({
        where: { dormitoryId: { in: dormitoryIds } },
        select: { id: true, code: true, dormitoryId: true },
      })
    : [];
  const buildingKey = new Map(
    buildings.map((building) => [`${building.dormitoryId}|${building.code}`, building.id]),
  );
  const buildingIds = buildings.map((building) => building.id);
  const floors = buildingIds.length
    ? await prisma.floor.findMany({
        where: { buildingId: { in: buildingIds } },
        select: { id: true, floorNumber: true, buildingId: true },
      })
    : [];
  const floorKey = new Map(
    floors.map((floor) => [`${floor.buildingId}|${floor.floorNumber}`, floor.id]),
  );
  const floorIds = floors.map((floor) => floor.id);
  const rooms = floorIds.length
    ? await prisma.room.findMany({
        where: { floorId: { in: floorIds } },
        select: { id: true, roomNumber: true, floorId: true, roomTypeId: true },
      })
    : [];
  const roomKey = new Map(rooms.map((room) => [`${room.floorId}|${room.roomNumber}`, room]));
  const roomIds = rooms.map((room) => room.id);
  const beds = roomIds.length
    ? await prisma.bed.findMany({
        where: { roomId: { in: roomIds } },
        select: { id: true, bedCode: true, roomId: true },
      })
    : [];
  const bedKey = new Map(beds.map((bed) => [`${bed.roomId}|${bed.bedCode}`, bed.id]));

  const seen = new Set<string>();
  return parsedRows.map(({ rowNumber, raw, input, errors }) => {
    const push = (message: string) => errors.push(message);

    if (entity === 'dormitories') {
      const locationCode = input.locationCode as string | undefined;
      if (locationCode) {
        const status = locationByCode.get(locationCode);
        if (!status) push(`locationCode: Kode lokasi ${locationCode} tidak ditemukan di master lokasi.`);
        else if (status !== 'ACTIVE') push(`locationCode: Lokasi ${locationCode} tidak aktif.`);
      }
    } else {
      const dormitoryCode = input.dormitoryCode as string | undefined;
      const dormitoryId = dormitoryCode ? dormitoryByCode.get(dormitoryCode) : undefined;
      if (dormitoryCode && !dormitoryId) {
        push(`dormitoryCode: Dormitory ${dormitoryCode} tidak ditemukan.`);
      }
      const buildingCode = input.buildingCode as string | undefined;
      const buildingId =
        dormitoryId && buildingCode ? buildingKey.get(`${dormitoryId}|${buildingCode}`) : undefined;
      if (buildingCode && dormitoryId && !buildingId) {
        push(`buildingCode: Gedung ${buildingCode} tidak ditemukan di dormitory ${dormitoryCode}.`);
      }
      const floorNumber = input.floorNumber as number | undefined;
      const floorId =
        buildingId && floorNumber !== undefined
          ? floorKey.get(`${buildingId}|${floorNumber}`)
          : undefined;
      if (floorNumber !== undefined && buildingId && !floorId) {
        push(
          `floorNumber: Lantai ${floorNumber} belum ada di gedung ${buildingCode}. Buat lantai melalui form terlebih dahulu.`,
        );
      }
      const roomNumber = input.roomNumber as string | undefined;
      const room = floorId && roomNumber ? roomKey.get(`${floorId}|${roomNumber}`) : undefined;
      if (entity === 'beds' && roomNumber && floorId && !room) {
        push(`roomNumber: Kamar ${roomNumber} tidak ditemukan di lantai ${floorNumber}.`);
      }
      if (entity === 'rooms') {
        const roomTypeCode = input.roomTypeCode as string | undefined;
        const roomTypeId = roomTypeCode ? roomTypeByCode.get(roomTypeCode) : undefined;
        if (roomTypeCode && !roomTypeId) {
          push(`roomTypeCode: Tipe kamar ${roomTypeCode} tidak ditemukan.`);
        }
        if (room && roomTypeId && room.roomTypeId !== roomTypeId) {
          push('roomTypeCode: Perubahan tipe kamar existing tidak diizinkan lewat impor; gunakan form edit.');
        }
      }
    }

    const key = duplicateKey(entity, input);
    let action: ImportRowAction = 'INVALID';
    if (errors.length === 0) {
      if (seen.has(key)) {
        push(`row: Duplikat dalam file untuk ${key}.`);
      } else {
        seen.add(key);
        action = existingId(entity, input) ? 'UPDATE' : 'INSERT';
      }
    }

    function existingId(
      target: MasterImportEntity,
      values: Record<string, unknown>,
    ): string | undefined {
      const dormitoryId = dormitoryByCode.get(String(values.dormitoryCode ?? values.code));
      switch (target) {
        case 'dormitories':
          return dormitoryByCode.get(String(values.code));
        case 'buildings':
          return dormitoryId ? buildingKey.get(`${dormitoryId}|${values.code}`) : undefined;
        case 'rooms': {
          const buildingId = dormitoryId
            ? buildingKey.get(`${dormitoryId}|${values.buildingCode}`)
            : undefined;
          const floorId =
            buildingId !== undefined
              ? floorKey.get(`${buildingId}|${values.floorNumber}`)
              : undefined;
          return floorId ? roomKey.get(`${floorId}|${values.roomNumber}`)?.id : undefined;
        }
        case 'beds': {
          const buildingId = dormitoryId
            ? buildingKey.get(`${dormitoryId}|${values.buildingCode}`)
            : undefined;
          const floorId =
            buildingId !== undefined
              ? floorKey.get(`${buildingId}|${values.floorNumber}`)
              : undefined;
          const room = floorId ? roomKey.get(`${floorId}|${values.roomNumber}`) : undefined;
          return room ? bedKey.get(`${room.id}|${values.bedCode}`) : undefined;
        }
      }
    }

    return { rowNumber, data: raw, errors, action };
  });
}

async function commitRow(
  tx: Tx,
  entity: MasterImportEntity,
  input: Record<string, unknown>,
  actorUserId: string,
): Promise<{ id: string; kind: 'inserted' | 'updated' }> {
  const errors: string[] = [];
  if (entity === 'dormitories') {
    const code = String(input.code);
    let locationId: string | undefined;
    const locationCode = input.locationCode as string | undefined;
    if (locationCode) {
      const location = await tx.location.findUnique({
        where: { code: locationCode },
        select: { id: true, status: true },
      });
      if (!location) errors.push(`locationCode: Kode lokasi ${locationCode} tidak ditemukan di master lokasi.`);
      else if (location.status !== 'ACTIVE') errors.push(`locationCode: Lokasi ${locationCode} tidak aktif.`);
      else locationId = location.id;
    }
    if (errors.length) throw new RowRejected(errors);
    const existing = await tx.dormitory.findUnique({ where: { code }, select: { id: true } });
    const description = input.description as string | undefined;
    if (existing) {
      const updated = await tx.dormitory.update({
        where: { id: existing.id },
        data: {
          name: String(input.name),
          ...(description !== undefined ? { description } : {}),
          ...(locationId ? { locationId } : {}),
          updatedBy: actorUserId,
        },
      });
      return { id: updated.id, kind: 'updated' };
    }
    const created = await tx.dormitory.create({
      data: {
        code,
        name: String(input.name),
        description: description ?? null,
        locationId: locationId ?? null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return { id: created.id, kind: 'inserted' };
  }

  const chain = await resolveChain(tx, input, errors, entity === 'beds');
  if (entity === 'buildings') {
    if (!chain.dormitory) errors.push('dormitoryCode: Dormitory tidak ditemukan.');
    if (errors.length) throw new RowRejected(errors);
    const code = String(input.code);
    const existing = await tx.building.findUnique({
      where: { dormitoryId_code: { dormitoryId: chain.dormitory!.id, code } },
      select: { id: true },
    });
    if (existing) {
      const updated = await tx.building.update({
        where: { id: existing.id },
        data: { name: String(input.name) },
      });
      return { id: updated.id, kind: 'updated' };
    }
    const created = await tx.building.create({
      data: { dormitoryId: chain.dormitory!.id, code, name: String(input.name) },
    });
    return { id: created.id, kind: 'inserted' };
  }

  if (!chain.floor) errors.push('floorNumber: Lantai tidak ditemukan.');
  if (entity === 'rooms') {
    const roomTypeCode = String(input.roomTypeCode);
    const roomType = await tx.roomType.findUnique({
      where: { code: roomTypeCode },
      select: { id: true },
    });
    if (!roomType) errors.push(`roomTypeCode: Tipe kamar ${roomTypeCode} tidak ditemukan.`);
    if (errors.length) throw new RowRejected(errors);
    const roomNumber = String(input.roomNumber);
    const existing = await tx.room.findUnique({
      where: { floorId_roomNumber: { floorId: chain.floor!.id, roomNumber } },
      select: { id: true, roomTypeId: true },
    });
    const name = input.name as string | undefined;
    const genderPolicy = input.genderPolicy as string | undefined;
    if (existing) {
      if (existing.roomTypeId !== roomType!.id) {
        throw new RowRejected([
          'roomTypeCode: Perubahan tipe kamar existing tidak diizinkan lewat impor; gunakan form edit.',
        ]);
      }
      const updated = await tx.room.update({
        where: { id: existing.id },
        data: {
          ...(name !== undefined ? { name } : {}),
          ...(genderPolicy !== undefined ? { genderPolicy } : {}),
        },
      });
      return { id: updated.id, kind: 'updated' };
    }
    const created = await tx.room.create({
      data: {
        floorId: chain.floor!.id,
        roomNumber,
        name: name ?? null,
        roomTypeId: roomType!.id,
        genderPolicy: genderPolicy ?? 'UNSPECIFIED',
        operationalStatus: 'ACTIVE',
        housekeepingStatus: 'READY',
      },
    });
    return { id: created.id, kind: 'inserted' };
  }

  if (!chain.room) errors.push('roomNumber: Kamar tidak ditemukan.');
  if (errors.length) throw new RowRejected(errors);
  const bedCode = String(input.bedCode);
  const label = input.label as string | undefined;
  const existing = await tx.bed.findUnique({
    where: { roomId_bedCode: { roomId: chain.room!.id, bedCode } },
    select: { id: true },
  });
  if (existing) {
    const updated = await tx.bed.update({
      where: { id: existing.id },
      data: { ...(label !== undefined ? { label } : {}) },
    });
    return { id: updated.id, kind: 'updated' };
  }
  const created = await tx.bed.create({
    data: {
      roomId: chain.room!.id,
      bedCode,
      label: label ?? null,
      status: 'ACTIVE',
      housekeepingStatus: 'READY',
    },
  });
  return { id: created.id, kind: 'inserted' };
}

class RowRejected extends Error {
  constructor(readonly reasons: string[]) {
    super(reasons.join(' '));
  }
}

masterImportRouter.get(
  '/master-data/import-template',
  requireAuth,
  async (req, res) => {
    const entity = validate(entitySchema, req.query.entity);
    requireEntityPermission(req, entity);
    const config = CONFIG[entity];
    const headerRow = MASTER_IMPORT_COLUMNS[entity].map((column) => ({
      value: column,
      fontWeight: 'bold' as const,
      backgroundColor: '#F3F1ED',
    }));
    const guideRows = config.guide.map(([field, rule]) => [{ value: field }, { value: rule }]);
    const file = await writeXlsxFile([
      { sheet: 'Data', data: [headerRow], stickyRowsCount: 1 },
      { sheet: 'Petunjuk', data: guideRows, columns: [{ width: 24 }, { width: 100 }] },
    ]);
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'MASTER_IMPORT_TEMPLATE_DOWNLOAD',
      entityType: 'MASTER_IMPORT',
      afterData: { entity },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="whoosh-stay-${entity}-import-template.xlsx"`,
    );
    res.send(await file.toBuffer());
  },
);

masterImportRouter.post(
  '/master-data/import/preview',
  requireAuth,
  uploadSingle,
  async (req, res) => {
    const entity = validate(entitySchema, req.query.entity);
    requireEntityPermission(req, entity);
    req.access = resolveAccessScope(req.auth!, CONFIG[entity].permission);
    requireGlobalScope(req, entity);
    if (!req.file) {
      throw new ValidationError([{ path: ['file'], message: 'File Excel wajib diunggah.' }]);
    }
    const fileName = req.file.originalname.slice(0, 255) || `${entity}.xlsx`;
    const dataRows = await parseImportWorkbook(
      req.file.buffer,
      MASTER_IMPORT_COLUMNS[entity],
      MASTER_IMPORT_MAX_ROWS,
    );
    const rows = await analyzeRows(entity, dataRows);
    const validCount = rows.filter((row) => row.action !== 'INVALID').length;
    const invalidCount = rows.length - validCount;

    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.masterImportBatch.create({
        data: {
          entity,
          fileName,
          status: 'PREVIEWED',
          rowCount: rows.length,
          validCount,
          invalidCount,
          uploadedBy: req.auth!.user.id,
        },
      });
      await tx.masterImportRow.createMany({
        data: rows.map((row) => ({
          batchId: created.id,
          rowNumber: row.rowNumber,
          data: row.data,
          errors: row.errors,
          action: row.action,
        })),
      });
      return created;
    });

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'MASTER_IMPORT_PREVIEW',
      entityType: 'MASTER_IMPORT',
      entityId: batch.id,
      afterData: { entity, fileName, rowCount: rows.length, validCount, invalidCount },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const preview: ImportPreview = { batch: toBatchSummary(batch), rows };
    sendSuccess(res, preview, { status: 201 });
  },
);

masterImportRouter.post(
  '/master-data/import/:batchId/commit',
  requireAuth,
  async (req, res) => {
    const batchId = validate(batchIdSchema, req.params.batchId);
    const batch = await prisma.masterImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundError('Import batch not found');
    const entity = validate(entitySchema, batch.entity);
    requireEntityPermission(req, entity);
    req.access = resolveAccessScope(req.auth!, CONFIG[entity].permission);
    requireGlobalScope(req, entity);
    if (batch.status !== 'PREVIEWED') {
      throw new ConflictError('CONFLICT', 'Batch impor ini sudah diproses.');
    }
    const rows = await prisma.masterImportRow.findMany({
      where: { batchId },
      orderBy: { rowNumber: 'asc' },
    });
    const candidates = rows.filter((row) => row.action !== 'INVALID');
    if (candidates.length === 0) {
      throw new ValidationError([
        { path: ['batch'], message: 'Tidak ada baris valid untuk diimpor.' },
      ]);
    }

    const actorUserId = req.auth!.user.id;
    const config = CONFIG[entity];
    const result = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.masterImportBatch.updateMany({
          where: { id: batch.id, status: 'PREVIEWED' },
          data: { status: 'COMMITTING' },
        });
        if (claimed.count !== 1) {
          throw new ConflictError('CONFLICT', 'Batch impor ini sudah diproses.');
        }
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        const skippedReasons: string[] = [];

        for (const row of candidates) {
          const raw = row.data as Record<string, string | null>;
          const input = toImportInput(raw, MASTER_IMPORT_COLUMNS[entity], config.uppercase);
          const parsed = config.schema.safeParse(input);
          if (!parsed.success) {
            skipped += 1;
            const reasons = schemaErrors(parsed);
            skippedReasons.push(`Baris ${row.rowNumber}: ${reasons.join(' ')}`);
            await tx.masterImportRow.update({
              where: { id: row.id },
              data: { action: 'INVALID', errors: [...((row.errors as string[]) ?? []), ...reasons] },
            });
            continue;
          }
          try {
            const committed = await commitRow(tx, entity, parsed.data, actorUserId);
            await tx.masterImportRow.update({
              where: { id: row.id },
              data: { entityId: committed.id },
            });
            if (committed.kind === 'inserted') inserted += 1;
            else updated += 1;
          } catch (error) {
            if (!(error instanceof RowRejected)) throw error;
            skipped += 1;
            skippedReasons.push(`Baris ${row.rowNumber}: ${error.reasons.join(' ')}`);
            await tx.masterImportRow.update({
              where: { id: row.id },
              data: {
                action: 'INVALID',
                errors: [...((row.errors as string[]) ?? []), ...error.reasons],
              },
            });
          }
        }

        const failedCount = batch.invalidCount + skipped;
        const committedBatch = await tx.masterImportBatch.update({
          where: { id: batch.id },
          data: {
            status: 'COMMITTED',
            validCount: inserted + updated,
            invalidCount: failedCount,
            insertedCount: inserted,
            updatedCount: updated,
            committedBy: actorUserId,
            committedAt: new Date(),
            errorSummary: skippedReasons.length ? skippedReasons.join('\n').slice(0, 2000) : null,
          },
        });
        return { committedBatch, inserted, updated, skipped };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    await writeAudit({
      actorUserId,
      action: 'MASTER_IMPORT_COMMIT',
      entityType: 'MASTER_IMPORT',
      entityId: batch.id,
      afterData: {
        entity,
        fileName: batch.fileName,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        invalid: batch.invalidCount,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const payload: ImportCommitResult = {
      batch: toBatchSummary(result.committedBatch),
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
    };
    sendSuccess(res, payload);
  },
);

masterImportRouter.get(
  '/master-data/import/batches',
  requireAnyPermission(MASTER_IMPORT_PERMISSIONS),
  async (req, res) => {
    const heldPermission = MASTER_IMPORT_PERMISSIONS.find((code) => hasPermission(req.auth!, code));
    req.access = resolveAccessScope(req.auth!, heldPermission!);
    if (!req.access.global) {
      throw new ForbiddenError('Master import history requires global scope');
    }
    const query = validate(paginationQuerySchema, req.query);
    const entity =
      typeof req.query.entity === 'string' && req.query.entity
        ? validate(entitySchema, req.query.entity)
        : undefined;
    const where: Prisma.MasterImportBatchWhereInput = entity ? { entity } : {};
    const [total, batches] = await Promise.all([
      prisma.masterImportBatch.count({ where }),
      prisma.masterImportBatch.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items: batches.map(toBatchSummary), pagination }, { pagination });
  },
);

masterImportRouter.get(
  '/master-data/import/batches/:batchId',
  requireAnyPermission(MASTER_IMPORT_PERMISSIONS),
  async (req, res) => {
    const heldPermission = MASTER_IMPORT_PERMISSIONS.find((code) => hasPermission(req.auth!, code));
    req.access = resolveAccessScope(req.auth!, heldPermission!);
    if (!req.access.global) {
      throw new ForbiddenError('Master import history requires global scope');
    }
    const batchId = validate(batchIdSchema, req.params.batchId);
    const batch = await prisma.masterImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundError('Import batch not found');
    const rows = await prisma.masterImportRow.findMany({
      where: { batchId: batch.id },
      orderBy: { rowNumber: 'asc' },
    });
    const preview: ImportPreview = {
      batch: toBatchSummary(batch),
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        data: row.data as Record<string, string | null>,
        errors: (row.errors as string[]) ?? [],
        action: row.action as ImportRowAction,
      })),
    };
    sendSuccess(res, preview);
  },
);