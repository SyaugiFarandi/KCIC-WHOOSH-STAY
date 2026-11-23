import { createHash, randomUUID } from 'node:crypto';
import { basename } from 'node:path';
import { Router, type Request, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { PERMISSIONS } from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { env } from '../../config/env.js';
import {
  AttachmentMissingError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { hasPermission } from '../auth/types.js';
import { writeAudit } from '../audit/audit.js';
import { canManageDormitory } from '../../lib/scope.js';
import {
  STORAGE_BUCKETS,
  getObjectStream,
  isMissingObjectError,
  putObject,
  removeObject,
  statObject,
} from '../../lib/storage.js';

export const attachmentsRouter = Router();

const ENTITY_TYPES = [
  'MAINTENANCE_TICKET',
  'HOUSEKEEPING_TASK',
  'RESERVATION',
  'OPERATIONAL_DOCUMENT',
] as const;
type EntityType = (typeof ENTITY_TYPES)[number];

const OPERATIONAL_DOCUMENT_SCOPE = '00000000-0000-0000-0000-000000000000';

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.ATTACHMENT_MAX_BYTES, files: 1 },
});

const uploadSingle: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(
        new PayloadTooLargeError(
          `File exceeds the ${Math.floor(env.ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB limit`,
        ),
      );
    }
    return next(new ValidationError([{ path: ['file'], message: 'File upload could not be parsed' }]));
  });
};

const uploadMetaSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.uuid(),
});

const listQuerySchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.uuid(),
});

const idSchema = z.uuid();

export function sanitizeFilename(input: string): string {
  const base = basename(input.replace(/\\/g, '/'))
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["/:*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const cleaned = base.replace(/^\.+/, '').slice(0, 180);
  return cleaned || 'file';
}

export function detectMagicMime(buffer: Buffer): string | null {
  if (buffer.length >= 8) {
    const png = buffer.subarray(0, 8);
    if (png.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
      return 'image/png';
    }
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  if (buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-') {
    return 'application/pdf';
  }
  return null;
}

interface EntityAccessContext {
  dormitoryId: string | null;
  buildingId: string | null;
  isSelfAllowed: boolean;
}

async function resolveEntityContext(
  req: Request,
  entityType: EntityType,
  entityId: string,
  mode: 'read' | 'upload',
): Promise<EntityAccessContext> {
  const access = req.access!;
  const user = req.auth!.user;
  const canWrite = (permission: Parameters<typeof hasPermission>[1]) =>
    hasPermission(req.auth!, permission);

  if (entityType === 'MAINTENANCE_TICKET') {
    if (!canWrite(PERMISSIONS.maintenanceRead)) {
      throw new ForbiddenError('Missing permission: maintenance.read');
    }
    const ticket = await prisma.maintenanceTicket.findUnique({
      where: { id: entityId },
      include: {
        room: { include: { floor: { include: { building: true } } } },
        bed: { include: { room: { include: { floor: { include: { building: true } } } } } },
      },
    });
    if (!ticket) throw new NotFoundError('Maintenance ticket not found');
    if (mode === 'upload' && !canWrite(PERMISSIONS.maintenanceCreate) && !canWrite(PERMISSIONS.maintenanceUpdate)) {
      throw new ForbiddenError('You cannot attach evidence to this maintenance ticket');
    }
    const room = ticket.room ?? ticket.bed?.room ?? null;
    const isSelfAllowed =
      access.selfOnly && (ticket.reportedBy === user.id || ticket.assignedTo === user.id);
    if (!access.global && !isSelfAllowed) {
      if (!room) throw new ForbiddenError('Maintenance ticket is outside your scope');
      if (!canManageDormitory(access, room.floor.building.dormitoryId, room.floor.buildingId)) {
        throw new ForbiddenError('Maintenance ticket is outside your scope');
      }
    }
    return {
      dormitoryId: room?.floor.building.dormitoryId ?? null,
      buildingId: room?.floor.buildingId ?? null,
      isSelfAllowed,
    };
  }

  if (entityType === 'HOUSEKEEPING_TASK') {
    if (!canWrite(PERMISSIONS.housekeepingRead)) {
      throw new ForbiddenError('Missing permission: housekeeping.read');
    }
    const task = await prisma.housekeepingTask.findUnique({
      where: { id: entityId },
      include: { room: { include: { floor: { include: { building: true } } } } },
    });
    if (!task) throw new NotFoundError('Housekeeping task not found');
    if (
      mode === 'upload' &&
      !canWrite(PERMISSIONS.housekeepingExecute) &&
      !canWrite(PERMISSIONS.housekeepingAssign) &&
      !canWrite(PERMISSIONS.housekeepingVerify)
    ) {
      throw new ForbiddenError('You cannot attach evidence to this housekeeping task');
    }
    const isSelfAllowed = access.selfOnly && task.assignedTo === user.id;
    if (!access.global && !isSelfAllowed) {
      if (
        !canManageDormitory(
          access,
          task.room.floor.building.dormitoryId,
          task.room.floor.buildingId,
        )
      ) {
        throw new ForbiddenError('Housekeeping task is outside your scope');
      }
    }
    return {
      dormitoryId: task.room.floor.building.dormitoryId,
      buildingId: task.room.floor.buildingId,
      isSelfAllowed,
    };
  }

  if (entityType === 'RESERVATION') {
    if (!canWrite(PERMISSIONS.reservationsRead)) {
      throw new ForbiddenError('Missing permission: reservations.read');
    }
    const reservation = await prisma.reservation.findUnique({
      where: { id: entityId },
      include: { guests: { select: { employeeId: true } } },
    });
    if (!reservation) throw new NotFoundError('Reservation not found');
    if (mode === 'upload' && !canWrite(PERMISSIONS.reservationsUpdate)) {
      throw new ForbiddenError('You cannot attach documents to this reservation');
    }
    const isSelfAllowed =
      access.selfOnly &&
      Boolean(user.employeeId) &&
      (reservation.createdBy === user.id ||
        reservation.primaryEmployeeId === user.employeeId ||
        reservation.guests.some((guest) => guest.employeeId === user.employeeId));
    if (!access.global && !isSelfAllowed) {
      if (!canManageDormitory(access, reservation.dormitoryId)) {
        throw new ForbiddenError('Reservation is outside your scope');
      }
    }
    return { dormitoryId: reservation.dormitoryId, buildingId: null, isSelfAllowed };
  }

  if (entityId !== OPERATIONAL_DOCUMENT_SCOPE) {
    throw new ValidationError([
      { path: ['entityId'], message: 'Operational documents must use the shared operational scope id' },
    ]);
  }
  if (!canWrite(PERMISSIONS.reportsExport)) {
    throw new ForbiddenError('Missing permission: reports.export');
  }
  if (!access.global) {
    throw new ForbiddenError('Operational documents require a global scope');
  }
  return { dormitoryId: null, buildingId: null, isSelfAllowed: false };
}

function mapAttachment(attachment: {
  id: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: bigint;
  checksum: string | null;
  entityType: string;
  entityId: string;
  uploadedBy: string;
  createdAt: Date;
}) {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: Number(attachment.sizeBytes),
    checksum: attachment.checksum,
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    uploadedBy: attachment.uploadedBy,
    createdAt: attachment.createdAt.toISOString(),
    downloadUrl: `/api/v1/attachments/${attachment.id}/download`,
  };
}

function canDeleteAttachment(req: Request, uploadedBy: string): boolean {
  return uploadedBy === req.auth!.user.id || hasPermission(req.auth!, PERMISSIONS.attachmentsDelete);
}

attachmentsRouter.post('/attachments', requirePermission(PERMISSIONS.attachmentsUpload), uploadSingle, async (req, res) => {
  const input = validate(uploadMetaSchema, req.body);
  await resolveEntityContext(req, input.entityType, input.entityId, 'upload');

  const file = req.file;
  if (!file?.buffer?.length) {
    throw new ValidationError([{ path: ['file'], message: 'A file is required' }]);
  }
  if (file.size > env.ATTACHMENT_MAX_BYTES) {
    throw new PayloadTooLargeError(
      `File exceeds the ${Math.floor(env.ATTACHMENT_MAX_BYTES / 1024 / 1024)} MB limit`,
    );
  }

  const detected = detectMagicMime(file.buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected)) {
    throw new UnsupportedMediaTypeError('Only JPEG, PNG, WebP or PDF files are accepted');
  }
  if (file.mimetype && file.mimetype !== 'application/octet-stream' && file.mimetype !== detected) {
    throw new UnsupportedMediaTypeError('The declared file type does not match the file content');
  }

  const checksum = createHash('sha256').update(file.buffer).digest('hex');
  const existing = await prisma.attachment.findFirst({
    where: {
      checksum,
      entityType: input.entityType,
      entityId: input.entityId,
      sizeBytes: BigInt(file.buffer.length),
    },
  });
  if (existing) {
    try {
      await statObject(STORAGE_BUCKETS.evidence, existing.objectKey);
      sendSuccess(res, mapAttachment(existing));
      return;
    } catch (error) {
      if (isMissingObjectError(error)) {
        await prisma.attachment.delete({ where: { id: existing.id } }).catch(() => undefined);
      } else {
        throw error;
      }
    }
  }

  const safeName = sanitizeFilename(file.originalname);
  const objectKey = `${input.entityType.toLowerCase()}/${input.entityId}/${randomUUID()}${EXTENSIONS[detected]}`;
  await putObject(STORAGE_BUCKETS.evidence, objectKey, file.buffer, detected);

  let created;
  try {
    created = await prisma.attachment.create({
      data: {
        objectKey,
        originalFilename: safeName,
        mimeType: detected,
        sizeBytes: BigInt(file.buffer.length),
        checksum,
        entityType: input.entityType,
        entityId: input.entityId,
        uploadedBy: req.auth!.user.id,
      },
    });
  } catch (error) {
    await removeObject(STORAGE_BUCKETS.evidence, objectKey);
    throw error;
  }

  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'ATTACHMENT_UPLOAD',
    entityType: 'ATTACHMENT',
    entityId: created.id,
    afterData: {
      targetEntityType: input.entityType,
      targetEntityId: input.entityId,
      filename: safeName,
      mimeType: detected,
      sizeBytes: file.buffer.length,
    },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  sendSuccess(res, mapAttachment(created), { status: 201 });
});

attachmentsRouter.get('/attachments', requirePermission(PERMISSIONS.attachmentsRead), async (req, res) => {
  const query = validate(listQuerySchema, req.query);
  await resolveEntityContext(req, query.entityType, query.entityId, 'read');
  const rows = await prisma.attachment.findMany({
    where: { entityType: query.entityType, entityId: query.entityId },
    orderBy: { createdAt: 'asc' },
  });
  sendSuccess(res, rows.map(mapAttachment));
});

attachmentsRouter.get('/attachments/:id', requirePermission(PERMISSIONS.attachmentsRead), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment not found');
  await resolveEntityContext(req, attachment.entityType as EntityType, attachment.entityId, 'read');
  sendSuccess(res, mapAttachment(attachment));
});

attachmentsRouter.get(
  '/attachments/:id/download',
  requirePermission(PERMISSIONS.attachmentsRead),
  async (req, res, next) => {
    const id = validate(idSchema, req.params.id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) throw new NotFoundError('Attachment not found');
    await resolveEntityContext(req, attachment.entityType as EntityType, attachment.entityId, 'read');

    let stream;
    try {
      stream = await getObjectStream(STORAGE_BUCKETS.evidence, attachment.objectKey);
    } catch (error) {
      if (isMissingObjectError(error)) throw new AttachmentMissingError();
      throw error;
    }

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ATTACHMENT_DOWNLOAD',
      entityType: 'ATTACHMENT',
      entityId: attachment.id,
      afterData: {
        targetEntityType: attachment.entityType,
        targetEntityId: attachment.entityId,
        filename: attachment.originalFilename,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    }).catch(() => undefined);

    const asciiName = attachment.originalFilename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    res.setHeader('Content-Type', attachment.mimeType);
    res.setHeader('Content-Length', attachment.sizeBytes.toString());
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(attachment.originalFilename)}`,
    );
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    try {
      await pipeline(stream, res);
    } catch {
      if (res.headersSent) res.destroy();
      else next(new AttachmentMissingError());
    }
  },
);

attachmentsRouter.delete('/attachments/:id', requirePermission(PERMISSIONS.attachmentsUpload), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('Attachment not found');
  await resolveEntityContext(req, attachment.entityType as EntityType, attachment.entityId, 'upload');
  if (!canDeleteAttachment(req, attachment.uploadedBy)) {
    throw new ForbiddenError('You cannot delete this attachment');
  }

  await prisma.attachment.delete({ where: { id } });
  const objectDeleted = await removeObject(STORAGE_BUCKETS.evidence, attachment.objectKey);

  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: 'ATTACHMENT_DELETE',
    entityType: 'ATTACHMENT',
    entityId: attachment.id,
    beforeData: {
      targetEntityType: attachment.entityType,
      targetEntityId: attachment.entityId,
      filename: attachment.originalFilename,
      objectKey: attachment.objectKey,
    },
    afterData: { objectDeleted },
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });

  sendSuccess(res, { id: attachment.id, deleted: true, objectDeleted });
});
