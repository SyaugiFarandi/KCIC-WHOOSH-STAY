import type { RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import readXlsxFile from 'read-excel-file/node';
import {
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../middleware/errors.js';

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface RawImportRow {
  rowNumber: number;
  raw: Record<string, string | null>;
}

export function createImportUpload(maxBytes: number = IMPORT_MAX_BYTES): RequestHandler {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
  });
  return (req, res, next) => {
    upload.single('file')(req, res, (error: unknown) => {
      if (!error) return next();
      if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
        return next(
          new PayloadTooLargeError(`File exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit`),
        );
      }
      return next(
        new ValidationError([{ path: ['file'], message: 'File upload could not be parsed' }]),
      );
    });
  };
}

export async function parseImportWorkbook(
  buffer: Buffer,
  columns: readonly string[],
  maxRows: number,
): Promise<RawImportRow[]> {
  if (buffer.length < 4 || buffer.toString('ascii', 0, 2) !== 'PK') {
    throw new UnsupportedMediaTypeError('Only .xlsx files are accepted for import');
  }
  let sheets: Awaited<ReturnType<typeof readXlsxFile>>;
  try {
    sheets = await readXlsxFile(buffer);
  } catch {
    throw new ValidationError([{ path: ['file'], message: 'File Excel tidak dapat dibaca.' }]);
  }
  const sheet = sheets.find((candidate) => candidate.sheet === 'Data') ?? sheets[0];
  if (!sheet) {
    throw new ValidationError([{ path: ['file'], message: 'File Excel tidak memiliki sheet data.' }]);
  }
  const rows = sheet.data;
  const header = (rows[0] ?? []).map((cell) => String(cell ?? '').trim());
  if (header.length < columns.length || columns.some((column, i) => header[i] !== column)) {
    throw new ValidationError([
      {
        path: ['file'],
        message: `Header sheet harus berurutan: ${columns.join(', ')}. Unduh template resmi terlebih dahulu.`,
      },
    ]);
  }
  const dataRows: RawImportRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i];
    const raw: Record<string, string | null> = {};
    let empty = true;
    columns.forEach((column, columnIndex) => {
      const cell = cells[columnIndex];
      const value =
        cell === null || cell === undefined
          ? null
          : cell instanceof Date
            ? cell.toISOString()
            : String(cell).trim();
      raw[column] = value === '' ? null : value;
      if (raw[column] !== null) empty = false;
    });
    if (!empty) dataRows.push({ rowNumber: i + 1, raw });
  }
  if (dataRows.length === 0) {
    throw new ValidationError([{ path: ['file'], message: 'File tidak berisi baris data.' }]);
  }
  if (dataRows.length > maxRows) {
    throw new ValidationError([
      { path: ['file'], message: `Maksimal ${maxRows} baris data per file.` },
    ]);
  }
  return dataRows;
}

export function toImportInput(
  raw: Record<string, string | null>,
  columns: readonly string[],
  uppercaseColumns: readonly string[] = [],
): Record<string, string> {
  const input: Record<string, string> = {};
  for (const column of columns) {
    const value = raw[column];
    if (value === null || value === undefined) continue;
    input[column] = uppercaseColumns.includes(column) ? value.toUpperCase() : value;
  }
  return input;
}

export function schemaErrors(result: { success: boolean; error?: { issues: Array<{ path: PropertyKey[]; message: string }> } }): string[] {
  if (result.success) return [];
  return (result.error?.issues ?? []).map(
    (issue) => `${String(issue.path[0] ?? 'row')}: ${issue.message}`,
  );
}