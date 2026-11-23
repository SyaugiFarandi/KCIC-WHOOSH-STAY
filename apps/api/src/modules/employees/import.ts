import { Router } from 'express';
import { z } from 'zod';
import writeXlsxFile from 'write-excel-file/node';
import {
  EMPLOYEE_IMPORT_COLUMNS,
  EMPLOYEE_IMPORT_EMPLOYMENT_STATUSES,
  EMPLOYEE_IMPORT_MAX_ROWS,
  employeeImportRowSchema,
  paginationQuerySchema,
  type EmployeeImportBatchSummary,
  type EmployeeImportCommitResult,
  type EmployeeImportPreview,
  type EmployeeImportPreviewRow,
  type EmployeeImportRowAction,
  type PaginationMeta,
} from '@whoosh/shared';
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
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';

export const employeeImportRouter = Router();

const IMPORT_SOURCE = 'IMPORT';
const batchIdSchema = z.uuid();

const uploadSingle = createImportUpload();

function requireGlobalImportScope(req: { access?: { global: boolean } }): void {
  if (!req.access?.global) {
    throw new ForbiddenError('Employee import requires global scope');
  }
}

function toBatchSummary(batch: {
  id: string;
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
}): EmployeeImportBatchSummary {
  return {
    id: batch.id,
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

const TEMPLATE_GUIDE: Array<[string, string]> = [
  ['employeeCode', 'Wajib. 2-50 karakter, huruf/angka/tanda hubung. Menjadi identitas unik impor (sumber IMPORT).'],
  ['fullName', 'Wajib. 2-150 karakter. Gunakan nama asli sesuai data SDM yang diverifikasi.'],
  ['employmentStatus', `Wajib. Salah satu dari: ${EMPLOYEE_IMPORT_EMPLOYMENT_STATUSES.join(', ')}.`],
  ['workEmail', 'Opsional. Format email valid, maksimal 255 karakter. Kosongkan jika belum tersedia.'],
  ['departmentCode', 'Opsional. Maksimal 50 karakter.'],
  ['departmentName', 'Opsional. Maksimal 150 karakter.'],
  ['positionCode', 'Opsional. Maksimal 50 karakter.'],
  ['positionName', 'Opsional. Maksimal 150 karakter.'],
  ['homeStationCode', 'Opsional. Harus cocok dengan kode master lokasi yang aktif (mis. HALIM, KARAWANG).'],
  ['Aturan umum', `Maksimal ${EMPLOYEE_IMPORT_MAX_ROWS} baris data per file. Baris dengan kode karyawan yang sama dalam satu file ditolak. Kode yang sudah ada dari impor sebelumnya akan diperbarui; kode yang terdaftar dari sumber lain ditolak.`],
  ['Privasi', 'Jangan mengisi data yang belum diverifikasi. Jangan mengarang NIK, email, atau nomor telepon.'],
];

employeeImportRouter.get(
  '/employees/import-template',
  requirePermission('employees.import'),
  async (req, res) => {
    const headerRow = EMPLOYEE_IMPORT_COLUMNS.map((column) => ({
      value: column,
      fontWeight: 'bold' as const,
      backgroundColor: '#F3F1ED',
    }));
    const guideRows = TEMPLATE_GUIDE.map(([field, rule]) => [{ value: field }, { value: rule }]);
    const file = await writeXlsxFile([
      { sheet: 'Data', data: [headerRow], stickyRowsCount: 1 },
      { sheet: 'Petunjuk', data: guideRows, columns: [{ width: 24 }, { width: 100 }] },
    ]);
    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'EMPLOYEE_IMPORT_TEMPLATE_DOWNLOAD',
      entityType: 'EMPLOYEE_IMPORT',
      afterData: { columns: EMPLOYEE_IMPORT_COLUMNS.length },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="whoosh-stay-employee-import-template.xlsx"',
    );
    res.send(await file.toBuffer());
  },
);

async function validateRows(dataRows: RawImportRow[]): Promise<EmployeeImportPreviewRow[]> {
  const codes = dataRows
    .map((row) => row.raw.employeeCode?.toUpperCase())
    .filter((code): code is string => Boolean(code));
  const [existingEmployees, locations] = await Promise.all([
    codes.length
      ? prisma.employee.findMany({
          where: { employeeCode: { in: codes } },
          select: { employeeCode: true, sourceSystem: true, externalEmployeeId: true },
        })
      : Promise.resolve([]),
    prisma.location.findMany({ select: { code: true, status: true } }),
  ]);
  const locationByCode = new Map(locations.map((location) => [location.code, location.status]));
  const seenCodes = new Set<string>();

  return dataRows.map(({ rowNumber, raw }) => {
    const errors: string[] = [];
    const input = toImportInput(raw, EMPLOYEE_IMPORT_COLUMNS, ['employeeCode', 'homeStationCode']);
    const parsed = employeeImportRowSchema.safeParse(input);
    errors.push(...schemaErrors(parsed));

    const code = input.employeeCode;
    if (code) {
      if (seenCodes.has(code)) {
        errors.push(`employeeCode: Kode ${code} duplikat di dalam file.`);
      } else {
        seenCodes.add(code);
        const conflict = existingEmployees.find((employee) => employee.employeeCode === code);
        if (
          conflict &&
          !(conflict.sourceSystem === IMPORT_SOURCE && conflict.externalEmployeeId === code)
        ) {
          errors.push(
            `employeeCode: Kode ${code} sudah terdaftar dari sumber lain (${conflict.sourceSystem}).`,
          );
        }
      }
    }
    const station = input.homeStationCode;
    if (station && !errors.some((error) => error.startsWith('homeStationCode:'))) {
      const status = locationByCode.get(station);
      if (!status) {
        errors.push(`homeStationCode: Kode lokasi ${station} tidak ditemukan di master lokasi.`);
      } else if (status !== 'ACTIVE') {
        errors.push(`homeStationCode: Lokasi ${station} tidak aktif.`);
      }
    }

    let action: EmployeeImportRowAction = 'INVALID';
    if (errors.length === 0) {
      const isUpdate = existingEmployees.some(
        (employee) =>
          employee.employeeCode === code &&
          employee.sourceSystem === IMPORT_SOURCE &&
          employee.externalEmployeeId === code,
      );
      action = isUpdate ? 'UPDATE' : 'INSERT';
    }
    return { rowNumber, data: raw, errors, action };
  });
}

employeeImportRouter.post(
  '/employees/import/preview',
  requirePermission('employees.import'),
  uploadSingle,
  async (req, res) => {
    requireGlobalImportScope(req);
    if (!req.file) {
      throw new ValidationError([{ path: ['file'], message: 'File Excel wajib diunggah.' }]);
    }
    const fileName = req.file.originalname.slice(0, 255) || 'employees.xlsx';
    const dataRows = await parseImportWorkbook(req.file.buffer, EMPLOYEE_IMPORT_COLUMNS, EMPLOYEE_IMPORT_MAX_ROWS);
    const rows = await validateRows(dataRows);
    const validCount = rows.filter((row) => row.action !== 'INVALID').length;
    const invalidCount = rows.length - validCount;

    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.employeeImportBatch.create({
        data: {
          fileName,
          status: 'PREVIEWED',
          rowCount: rows.length,
          validCount,
          invalidCount,
          uploadedBy: req.auth!.user.id,
        },
      });
      await tx.employeeImportRow.createMany({
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
      action: 'EMPLOYEE_IMPORT_PREVIEW',
      entityType: 'EMPLOYEE_IMPORT',
      entityId: batch.id,
      afterData: { fileName, rowCount: rows.length, validCount, invalidCount },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const preview: EmployeeImportPreview = { batch: toBatchSummary(batch), rows };
    sendSuccess(res, preview, { status: 201 });
  },
);

employeeImportRouter.post(
  '/employees/import/:batchId/commit',
  requirePermission('employees.import'),
  async (req, res) => {
    requireGlobalImportScope(req);
    const batchId = validate(batchIdSchema, req.params.batchId);
    const batch = await prisma.employeeImportBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundError('Import batch not found');
    if (batch.status !== 'PREVIEWED') {
      throw new ConflictError('CONFLICT', 'Batch impor ini sudah diproses.');
    }
    const rows = await prisma.employeeImportRow.findMany({
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
    const result = await prisma.$transaction(
      async (tx) => {
        const claimed = await tx.employeeImportBatch.updateMany({
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
          const input = toImportInput(raw, EMPLOYEE_IMPORT_COLUMNS, ['employeeCode', 'homeStationCode']);
          const parsed = employeeImportRowSchema.safeParse(input);
          const code = input.employeeCode;
          const rejection: string[] = schemaErrors(parsed);

          if (parsed.success && code) {
            const conflict = await tx.employee.findFirst({
              where: {
                employeeCode: code,
                NOT: { sourceSystem: IMPORT_SOURCE, externalEmployeeId: code },
              },
              select: { sourceSystem: true },
            });
            if (conflict) {
              rejection.push(
                `employeeCode: Kode ${code} sudah terdaftar dari sumber lain (${conflict.sourceSystem}).`,
              );
            }
            if (input.homeStationCode) {
              const location = await tx.location.findUnique({
                where: { code: input.homeStationCode },
                select: { status: true },
              });
              if (!location) {
                rejection.push(
                  `homeStationCode: Kode lokasi ${input.homeStationCode} tidak ditemukan di master lokasi.`,
                );
              } else if (location.status !== 'ACTIVE') {
                rejection.push(`homeStationCode: Lokasi ${input.homeStationCode} tidak aktif.`);
              }
            }
          }

          if (!parsed.success || rejection.length > 0) {
            skipped += 1;
            skippedReasons.push(`Baris ${row.rowNumber}: ${rejection.join(' ')}`);
            await tx.employeeImportRow.update({
              where: { id: row.id },
              data: {
                action: 'INVALID',
                errors: [...((row.errors as string[]) ?? []), ...rejection],
              },
            });
            continue;
          }

          const values = parsed.data;
          const existing = await tx.employee.findUnique({
            where: {
              sourceSystem_externalEmployeeId: {
                sourceSystem: IMPORT_SOURCE,
                externalEmployeeId: values.employeeCode,
              },
            },
            select: { id: true },
          });
          const employee = await tx.employee.upsert({
            where: {
              sourceSystem_externalEmployeeId: {
                sourceSystem: IMPORT_SOURCE,
                externalEmployeeId: values.employeeCode,
              },
            },
            update: {
              employeeCode: values.employeeCode,
              fullName: values.fullName,
              workEmail: values.workEmail ?? null,
              departmentCode: values.departmentCode ?? null,
              departmentName: values.departmentName ?? null,
              positionCode: values.positionCode ?? null,
              positionName: values.positionName ?? null,
              homeStationCode: values.homeStationCode ?? null,
              employmentStatus: values.employmentStatus,
              syncedAt: new Date(),
            },
            create: {
              sourceSystem: IMPORT_SOURCE,
              externalEmployeeId: values.employeeCode,
              employeeCode: values.employeeCode,
              fullName: values.fullName,
              workEmail: values.workEmail ?? null,
              departmentCode: values.departmentCode ?? null,
              departmentName: values.departmentName ?? null,
              positionCode: values.positionCode ?? null,
              positionName: values.positionName ?? null,
              homeStationCode: values.homeStationCode ?? null,
              employmentStatus: values.employmentStatus,
              syncedAt: new Date(),
            },
          });
          await tx.employeeImportRow.update({
            where: { id: row.id },
            data: { employeeId: employee.id },
          });
          if (existing) updated += 1;
          else inserted += 1;
        }

        const failedCount = batch.invalidCount + skipped;
        const committed = await tx.employeeImportBatch.update({
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
        const syncRun = await tx.employeeSyncLog.create({
          data: {
            sourceSystem: IMPORT_SOURCE,
            status: failedCount > 0 ? 'PARTIAL' : 'SUCCEEDED',
            finishedAt: new Date(),
            fetchedCount: batch.rowCount,
            insertedCount: inserted,
            updatedCount: updated,
            failedCount,
            errorSummary: committed.errorSummary,
            initiatedBy: actorUserId,
          },
        });
        return { committed, inserted, updated, skipped, syncRunId: syncRun.id };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );

    await writeAudit({
      actorUserId,
      action: 'EMPLOYEE_IMPORT_COMMIT',
      entityType: 'EMPLOYEE_IMPORT',
      entityId: batch.id,
      afterData: {
        fileName: batch.fileName,
        inserted: result.inserted,
        updated: result.updated,
        skipped: result.skipped,
        invalid: batch.invalidCount,
        syncRunId: result.syncRunId,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    const payload: EmployeeImportCommitResult = {
      batch: toBatchSummary(result.committed),
      inserted: result.inserted,
      updated: result.updated,
      skipped: result.skipped,
      syncRunId: result.syncRunId,
    };
    sendSuccess(res, payload);
  },
);

employeeImportRouter.get(
  '/employees/import/batches',
  requirePermission('employees.import'),
  async (req, res) => {
    requireGlobalImportScope(req);
    const query = validate(paginationQuerySchema, req.query);
    const [total, batches] = await Promise.all([
      prisma.employeeImportBatch.count(),
      prisma.employeeImportBatch.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
    sendSuccess(res, { items: batches.map(toBatchSummary), pagination }, { pagination });
  },
);

employeeImportRouter.get(
  '/employees/import/batches/:batchId',
  requirePermission('employees.import'),
  async (req, res) => {
    requireGlobalImportScope(req);
    const batchId = validate(batchIdSchema, req.params.batchId);
    const batch = await prisma.employeeImportBatch.findUnique({
      where: { id: batchId },
    });
    if (!batch) throw new NotFoundError('Import batch not found');
    const rows = await prisma.employeeImportRow.findMany({
      where: { batchId: batch.id },
      orderBy: { rowNumber: 'asc' },
    });
    const preview: EmployeeImportPreview = {
      batch: toBatchSummary(batch),
      rows: rows.map((row) => ({
        rowNumber: row.rowNumber,
        data: row.data as Record<string, string | null>,
        errors: (row.errors as string[]) ?? [],
        action: row.action as EmployeeImportRowAction,
      })),
    };
    sendSuccess(res, preview);
  },
);