import { randomUUID } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import multer, { MulterError } from 'multer';
import { pipeline } from 'node:stream/promises';
import sharp, { type OutputInfo } from 'sharp';
import {
  accommodationPhotoReorderSchema,
  accommodationPhotoUpdateSchema,
  accommodationPhotoUploadMetaSchema,
  PERMISSIONS,
  type AccommodationGallery,
  type AccommodationGalleryDormitory,
  type AccommodationPhoto,
  type AccommodationPhotoCategory,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { env } from '../../config/env.js';
import {
  AttachmentMissingError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  PayloadTooLargeError,
  UnsupportedMediaTypeError,
  ValidationError,
} from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import type { AccessScope } from '../auth/types.js';
import { writeAudit } from '../audit/audit.js';
import { assertManageDormitory, readableDormitoryWhere } from '../../lib/scope.js';
import {
  STORAGE_BUCKETS,
  getObjectStream,
  isMissingObjectError,
  putObject,
  removeObject,
} from '../../lib/storage.js';
import { detectMagicMime, sanitizeFilename } from '../attachments/routes.js';
import { z } from 'zod';

export const accommodationRouter = Router();

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const FULL_MAX_WIDTH = 1600;
const THUMB_WIDTH = 480;
const THUMB_HEIGHT = 360;

const photoInclude = {
  room: { include: { roomType: true } },
} as const;

const idSchema = z.uuid();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.GALLERY_PHOTO_MAX_BYTES, files: 1 },
});

const uploadSingle: RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: unknown) => {
    if (!error) return next();
    if (error instanceof MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return next(
        new PayloadTooLargeError(
          `Photo exceeds the ${Math.floor(env.GALLERY_PHOTO_MAX_BYTES / 1024 / 1024)} MB limit`,
        ),
      );
    }
    return next(new ValidationError([{ path: ['file'], message: 'Photo upload could not be parsed' }]));
  });
};

function photoUrl(id: string, variant: 'full' | 'thumb'): string {
  return `/api/v1/accommodation/photos/${id}/image${variant === 'thumb' ? '?size=thumb' : ''}`;
}

function mapPhoto(photo: {
  id: string;
  dormitoryId: string;
  roomId: string | null;
  category: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  width: number;
  height: number;
  sizeBytes: bigint;
  createdAt: Date;
  room: { roomNumber: string; roomType: { name: string } } | null;
}): AccommodationPhoto {
  return {
    id: photo.id,
    dormitoryId: photo.dormitoryId,
    roomId: photo.roomId,
    roomNumber: photo.room?.roomNumber ?? null,
    roomTypeName: photo.room?.roomType.name ?? null,
    category: photo.category as AccommodationPhotoCategory,
    caption: photo.caption,
    sortOrder: photo.sortOrder,
    isCover: photo.isCover,
    width: photo.width,
    height: photo.height,
    sizeBytes: Number(photo.sizeBytes),
    url: photoUrl(photo.id, 'full'),
    thumbnailUrl: photoUrl(photo.id, 'thumb'),
    createdAt: photo.createdAt.toISOString(),
  };
}

async function loadPhoto(id: string) {
  const photo = await prisma.accommodationPhoto.findUnique({
    where: { id },
    include: photoInclude,
  });
  if (!photo) throw new NotFoundError('Photo not found');
  return photo;
}

async function assertReadableDormitory(
  access: AccessScope,
  dormitoryId: string,
  status?: string,
): Promise<void> {
  if (status && status !== 'ACTIVE') {
    throw new ForbiddenError('Dormitory is not active');
  }
  if (access.global || access.selfOnly) return;
  const allowed = await prisma.dormitory.findFirst({
    where: { id: dormitoryId, ...readableDormitoryWhere(access) },
    select: { id: true },
  });
  if (!allowed) throw new ForbiddenError('Dormitory is outside your scope');
}

accommodationRouter.get(
  '/accommodation/gallery',
  requirePermission(PERMISSIONS.dormitoriesRead),
  async (req, res) => {
    const access = req.access!;
    const dormitoryId =
      typeof req.query.dormitoryId === 'string' && req.query.dormitoryId
        ? validate(idSchema, req.query.dormitoryId)
        : undefined;

    const dormitories = await prisma.dormitory.findMany({
      where: {
        ...readableDormitoryWhere(access),
        ...(access.selfOnly ? { status: 'ACTIVE' } : {}),
        ...(dormitoryId ? { id: dormitoryId } : {}),
      },
      include: {
        photos: {
          include: photoInclude,
          orderBy: [{ isCover: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
        },
        buildings: {
          include: {
            floors: {
              include: {
                rooms: {
                  include: {
                    roomType: true,
                    beds: { select: { id: true } },
                    roomFacilities: { include: { facility: true } },
                  },
                },
              },
            },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const items: AccommodationGalleryDormitory[] = dormitories.map((dormitory) => {
      const rooms = dormitory.buildings.flatMap((building) =>
        building.floors.flatMap((floor) => floor.rooms),
      );
      const photos = dormitory.photos.map(mapPhoto);
      const coverPhoto =
        photos.find((photo) => photo.isCover && photo.roomId === null) ??
        photos.find((photo) => photo.roomId === null) ??
        photos.find((photo) => photo.isCover) ??
        photos[0] ??
        null;

      const roomTypeMap = new Map<
        string,
        { code: string; name: string; capacity: number; roomIds: Set<string> }
      >();
      for (const room of rooms) {
        const entry = roomTypeMap.get(room.roomType.code) ?? {
          code: room.roomType.code,
          name: room.roomType.name,
          capacity: room.roomType.defaultCapacity,
          roomIds: new Set<string>(),
        };
        entry.roomIds.add(room.id);
        roomTypeMap.set(room.roomType.code, entry);
      }

      const facilities = [
        ...new Set(
          rooms.flatMap((room) => room.roomFacilities.map((item) => item.facility.name)),
        ),
      ].sort();

      return {
        dormitoryId: dormitory.id,
        code: dormitory.code,
        name: dormitory.name,
        description: dormitory.description,
        address: dormitory.address,
        stationCode: dormitory.stationCode,
        coverPhoto,
        photos,
        roomTypes: [...roomTypeMap.values()].map((entry) => ({
          code: entry.code,
          name: entry.name,
          capacity: entry.capacity,
          photos: photos.filter((photo) => photo.roomId && entry.roomIds.has(photo.roomId)),
        })),
        facilities,
        bedCount: rooms.reduce((sum, room) => sum + room.beds.length, 0),
        roomCount: rooms.length,
      };
    });

    const gallery: AccommodationGallery = { items };
    sendSuccess(res, gallery);
  },
);

accommodationRouter.post(
  '/accommodation/photos',
  requirePermission(PERMISSIONS.photosManage),
  uploadSingle,
  async (req, res) => {
    if (!req.file) {
      throw new ValidationError([{ path: ['file'], message: 'Photo file is required' }]);
    }
    const input = validate(accommodationPhotoUploadMetaSchema, req.body);
    const context = await prisma.dormitory.findUnique({
      where: { id: input.dormitoryId },
      include: { buildings: { select: { id: true } } },
    });
    if (!context) throw new NotFoundError('Dormitory not found');

    let roomBuildingId: string | undefined;
    if (input.roomId) {
      const room = await prisma.room.findUnique({
        where: { id: input.roomId },
        include: { floor: { select: { buildingId: true, building: { select: { dormitoryId: true } } } } },
      });
      if (!room || room.floor.building.dormitoryId !== input.dormitoryId) {
        throw new ValidationError([{ path: ['roomId'], message: 'Room does not belong to the dormitory' }]);
      }
      roomBuildingId = room.floor.buildingId;
    }
    assertManageDormitory(req.access!, input.dormitoryId, roomBuildingId);

    const detected = detectMagicMime(req.file.buffer);
    if (!detected || !IMAGE_MIME_TYPES.has(detected)) {
      throw new UnsupportedMediaTypeError('Only JPEG, PNG, or WebP photos are accepted');
    }
    if (req.file.mimetype && req.file.mimetype !== 'application/octet-stream' && req.file.mimetype !== detected) {
      throw new UnsupportedMediaTypeError('Photo content does not match the declared type');
    }

    let full: { data: Buffer; info: OutputInfo };
    let thumb: Buffer;
    try {
      full = await sharp(req.file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: FULL_MAX_WIDTH, height: FULL_MAX_WIDTH, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
      thumb = await sharp(req.file.buffer, { failOn: 'error' })
        .rotate()
        .resize({ width: THUMB_WIDTH, height: THUMB_HEIGHT, fit: 'cover' })
        .webp({ quality: 72 })
        .toBuffer();
    } catch {
      throw new UnsupportedMediaTypeError('Photo could not be decoded');
    }

    const id = randomUUID();
    const scopeSegment = input.roomId ?? 'dormitory';
    const objectKey = `gallery/${input.dormitoryId}/${scopeSegment}/${id}.webp`;
    const thumbnailKey = `gallery/${input.dormitoryId}/${scopeSegment}/${id}-thumb.webp`;
    await putObject(STORAGE_BUCKETS.assets, objectKey, full.data, 'image/webp');
    await putObject(STORAGE_BUCKETS.assets, thumbnailKey, thumb, 'image/webp');

    const existing = await prisma.accommodationPhoto.aggregate({
      where: { dormitoryId: input.dormitoryId, roomId: input.roomId ?? null },
      _max: { sortOrder: true },
      _count: { _all: true },
    });

    let created;
    try {
      created = await prisma.accommodationPhoto.create({
        data: {
          id,
          dormitoryId: input.dormitoryId,
          roomId: input.roomId ?? null,
          category: input.category,
          caption: input.caption ?? null,
          sortOrder: (existing._max.sortOrder ?? -1) + 1,
          isCover: existing._count._all === 0,
          objectKey,
          thumbnailKey,
          mimeType: 'image/webp',
          width: full.info.width,
          height: full.info.height,
          sizeBytes: BigInt(full.data.byteLength),
          originalFilename: sanitizeFilename(req.file.originalname || 'photo'),
          uploadedBy: req.auth!.user.id,
        },
        include: photoInclude,
      });
    } catch (error) {
      await removeObject(STORAGE_BUCKETS.assets, objectKey);
      await removeObject(STORAGE_BUCKETS.assets, thumbnailKey);
      throw error;
    }

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ACCOMMODATION_PHOTO_UPLOAD',
      entityType: 'ACCOMMODATION_PHOTO',
      entityId: created.id,
      afterData: {
        dormitoryId: created.dormitoryId,
        roomId: created.roomId,
        category: created.category,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, mapPhoto(created), { status: 201 });
  },
);

accommodationRouter.patch(
  '/accommodation/photos/:id',
  requirePermission(PERMISSIONS.photosManage),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const photo = await loadPhoto(id);
    const dormitory = await prisma.dormitory.findUnique({
      where: { id: photo.dormitoryId },
      include: { buildings: { select: { id: true } } },
    });
    if (!dormitory) throw new NotFoundError('Dormitory not found');
    const buildingId = photo.roomId
      ? (
          await prisma.room.findUnique({
            where: { id: photo.roomId },
            select: { floor: { select: { buildingId: true } } },
          })
        )?.floor.buildingId
      : undefined;
    assertManageDormitory(req.access!, photo.dormitoryId, buildingId);

    const input = validate(accommodationPhotoUpdateSchema, req.body);

    const updated = await prisma.$transaction(async (tx) => {
      if (input.isCover === true) {
        await tx.accommodationPhoto.updateMany({
          where: {
            dormitoryId: photo.dormitoryId,
            roomId: photo.roomId,
            isCover: true,
            NOT: { id: photo.id },
          },
          data: { isCover: false },
        });
      }
      return tx.accommodationPhoto.update({
        where: { id: photo.id },
        data: {
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.category ? { category: input.category } : {}),
          ...(input.isCover !== undefined ? { isCover: input.isCover } : {}),
        },
        include: photoInclude,
      });
    });

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ACCOMMODATION_PHOTO_UPDATE',
      entityType: 'ACCOMMODATION_PHOTO',
      entityId: id,
      beforeData: { caption: photo.caption, category: photo.category, isCover: photo.isCover },
      afterData: { caption: updated.caption, category: updated.category, isCover: updated.isCover },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, mapPhoto(updated));
  },
);

accommodationRouter.post(
  '/accommodation/photos/reorder',
  requirePermission(PERMISSIONS.photosManage),
  async (req, res) => {
    const input = validate(accommodationPhotoReorderSchema, req.body);
    const dormitory = await prisma.dormitory.findUnique({
      where: { id: input.dormitoryId },
      include: { buildings: { select: { id: true } } },
    });
    if (!dormitory) throw new NotFoundError('Dormitory not found');
    assertManageDormitory(req.access!, input.dormitoryId);

    const photos = await prisma.accommodationPhoto.findMany({
      where: {
        dormitoryId: input.dormitoryId,
        roomId: input.roomId ?? null,
        id: { in: input.orderedIds },
      },
      select: { id: true },
    });
    if (photos.length !== input.orderedIds.length || photos.length !== new Set(input.orderedIds).size) {
      throw new ConflictError('CONFLICT', 'Photos do not belong to the selected scope');
    }

    await prisma.$transaction(
      input.orderedIds.map((photoId, index) =>
        prisma.accommodationPhoto.update({ where: { id: photoId }, data: { sortOrder: index } }),
      ),
    );

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ACCOMMODATION_PHOTO_REORDER',
      entityType: 'DORMITORY',
      entityId: input.dormitoryId,
      afterData: { roomId: input.roomId ?? null, orderedIds: input.orderedIds },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { orderedIds: input.orderedIds });
  },
);

accommodationRouter.delete(
  '/accommodation/photos/:id',
  requirePermission(PERMISSIONS.photosManage),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const photo = await loadPhoto(id);
    const buildingId = photo.roomId
      ? (
          await prisma.room.findUnique({
            where: { id: photo.roomId },
            select: { floor: { select: { buildingId: true } } },
          })
        )?.floor.buildingId
      : undefined;
    assertManageDormitory(req.access!, photo.dormitoryId, buildingId);

    await removeObject(STORAGE_BUCKETS.assets, photo.objectKey);
    await removeObject(STORAGE_BUCKETS.assets, photo.thumbnailKey);
    await prisma.accommodationPhoto.delete({ where: { id } });

    if (photo.isCover) {
      const next = await prisma.accommodationPhoto.findFirst({
        where: { dormitoryId: photo.dormitoryId, roomId: photo.roomId },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      });
      if (next) {
        await prisma.accommodationPhoto.update({ where: { id: next.id }, data: { isCover: true } });
      }
    }

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'ACCOMMODATION_PHOTO_DELETE',
      entityType: 'ACCOMMODATION_PHOTO',
      entityId: id,
      beforeData: {
        dormitoryId: photo.dormitoryId,
        roomId: photo.roomId,
        objectKey: photo.objectKey,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });

    sendSuccess(res, { id, deleted: true });
  },
);

accommodationRouter.get(
  '/accommodation/photos/:id/image',
  requirePermission(PERMISSIONS.dormitoriesRead),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const photo = await prisma.accommodationPhoto.findUnique({
      where: { id },
      select: {
        id: true,
        dormitoryId: true,
        objectKey: true,
        thumbnailKey: true,
        dormitory: { select: { status: true } },
      },
    });
    if (!photo) throw new NotFoundError('Photo not found');
    await assertReadableDormitory(req.access!, photo.dormitoryId, photo.dormitory.status);

    const wantsThumb = req.query.size === 'thumb';
    const objectKey = wantsThumb ? photo.thumbnailKey : photo.objectKey;
    try {
      const stream = await getObjectStream(STORAGE_BUCKETS.assets, objectKey);
      res.setHeader('Content-Type', 'image/webp');
      res.setHeader('Cache-Control', 'private, max-age=86400, immutable');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', 'inline');
      await pipeline(stream, res);
    } catch (error) {
      if (isMissingObjectError(error)) {
        throw new AttachmentMissingError('Photo object is missing from storage');
      }
      throw error;
    }
  },
);
