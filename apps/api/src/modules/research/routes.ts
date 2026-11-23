import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  ERROR_CODES,
  RESEARCH_CLASSIFICATIONS,
  paginationQuerySchema,
  type PaginationMeta,
  type ResearchClassification,
  type ResearchEventItem,
  type ResearchItem,
  type ResearchPropertyType,
  type ResearchSourceItem,
  type ResearchSummary,
  type ResearchVerificationStatus,
} from '@whoosh/shared';
import { prisma } from '../../lib/prisma.js';
import { paginationMeta, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { AppError, ConflictError, NotFoundError } from '../../middleware/errors.js';
import { requirePermission } from '../auth/middleware.js';
import { writeAudit } from '../audit/audit.js';

export const researchRouter = Router();

const idSchema = z.uuid();
const classificationSchema = z.enum(RESEARCH_CLASSIFICATIONS);
const reviewSchema = z.object({ note: z.string().trim().max(2000).optional() });
const rejectSchema = z.object({ note: z.string().trim().min(1).max(2000) });
const classificationChangeSchema = z.object({
  classification: classificationSchema,
  note: z.string().trim().min(1).max(2000),
});

const researchInclude = {
  location: { select: { code: true, name: true } },
  reviewer: { select: { displayName: true } },
  sources: { orderBy: { checkedAt: 'desc' as const } },
} satisfies Prisma.AccommodationResearchInclude;

type ResearchWithRelations = Prisma.AccommodationResearchGetPayload<{
  include: typeof researchInclude;
}>;

function optionalFilter(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function toSourceItem(source: {
  id: string;
  url: string;
  title: string | null;
  sourceType: string;
  checkedAt: Date;
  photoUrl: string | null;
  photoRights: string | null;
  photoTakenAt: Date | null;
  notes: string | null;
}): ResearchSourceItem {
  return {
    id: source.id,
    url: source.url,
    title: source.title,
    sourceType: source.sourceType as ResearchSourceItem['sourceType'],
    checkedAt: source.checkedAt.toISOString().slice(0, 10),
    photoUrl: source.photoUrl,
    photoRights: source.photoRights,
    photoTakenAt: source.photoTakenAt ? source.photoTakenAt.toISOString().slice(0, 10) : null,
    notes: source.notes,
  };
}

function toItem(research: ResearchWithRelations): ResearchItem {
  return {
    id: research.id,
    locationCode: research.location.code,
    locationName: research.location.name,
    name: research.name,
    address: research.address,
    latitude: research.latitude === null ? null : Number(research.latitude),
    longitude: research.longitude === null ? null : Number(research.longitude),
    distanceKm: research.distanceKm === null ? null : Number(research.distanceKm),
    propertyType: research.propertyType as ResearchPropertyType | null,
    classification: research.classification as ResearchClassification,
    verificationStatus: research.verificationStatus as ResearchVerificationStatus,
    facilities: Array.isArray(research.facilities)
      ? (research.facilities as unknown[]).filter((entry): entry is string => typeof entry === 'string')
      : [],
    website: research.website,
    contactName: research.contactName,
    contactPhone: research.contactPhone,
    notes: research.notes,
    promotedDormitoryId: research.promotedDormitoryId,
    reviewedByName: research.reviewer?.displayName ?? null,
    reviewedAt: research.reviewedAt?.toISOString() ?? null,
    sources: research.sources.map(toSourceItem),
    createdAt: research.createdAt.toISOString(),
    updatedAt: research.updatedAt.toISOString(),
  };
}

async function loadResearch(id: string): Promise<ResearchWithRelations> {
  const research = await prisma.accommodationResearch.findUnique({
    where: { id },
    include: researchInclude,
  });
  if (!research) throw new NotFoundError('Kandidat riset tidak ditemukan.');
  return research;
}

researchRouter.get('/research', requirePermission('research.read'), async (req, res) => {
  const query = validate(paginationQuerySchema, req.query);
  const locationCode = optionalFilter(req.query.locationCode);
  const classification = optionalFilter(req.query.classification);
  const verificationStatus = optionalFilter(req.query.verificationStatus);
  const propertyType = optionalFilter(req.query.propertyType);

  const where: Prisma.AccommodationResearchWhereInput = {
    ...(locationCode ? { location: { code: locationCode } } : {}),
    ...(classification ? { classification } : {}),
    ...(verificationStatus ? { verificationStatus } : {}),
    ...(propertyType ? { propertyType } : {}),
    ...(query.q
      ? {
          OR: [
            { name: { contains: query.q, mode: 'insensitive' } },
            { address: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.accommodationResearch.count({ where }),
    prisma.accommodationResearch.findMany({
      where,
      include: researchInclude,
      orderBy: [{ location: { code: 'asc' } }, { name: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
  ]);

  const items = rows.map(toItem);
  const pagination: PaginationMeta = paginationMeta(total, query.page, query.pageSize);
  sendSuccess(res, { items, pagination }, { pagination });
});

researchRouter.get('/research/summary', requirePermission('research.read'), async (_req, res) => {
  const [total, classificationRows, statusRows, locationRows, promoted] = await Promise.all([
    prisma.accommodationResearch.count(),
    prisma.accommodationResearch.groupBy({ by: ['classification'], _count: { _all: true } }),
    prisma.accommodationResearch.groupBy({ by: ['verificationStatus'], _count: { _all: true } }),
    prisma.accommodationResearch.groupBy({ by: ['locationId'], _count: { _all: true } }),
    prisma.accommodationResearch.count({ where: { promotedDormitoryId: { not: null } } }),
  ]);
  const locations = await prisma.location.findMany({
    where: { id: { in: locationRows.map((row) => row.locationId) } },
    select: { id: true, code: true },
  });
  const codeById = new Map(locations.map((location) => [location.id, location.code]));
  const summary: ResearchSummary = {
    total,
    byClassification: Object.fromEntries(
      classificationRows.map((row) => [row.classification, row._count._all]),
    ),
    byVerificationStatus: Object.fromEntries(
      statusRows.map((row) => [row.verificationStatus, row._count._all]),
    ),
    byLocation: Object.fromEntries(
      locationRows.map((row) => [codeById.get(row.locationId) ?? row.locationId, row._count._all]),
    ),
    promoted,
  };
  sendSuccess(res, summary);
});

researchRouter.get(
  '/research/filter-options',
  requirePermission('research.read'),
  async (_req, res) => {
    const locations = await prisma.location.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    });
    sendSuccess(res, { locations });
  },
);

researchRouter.get('/research/:id', requirePermission('research.read'), async (req, res) => {
  const id = validate(idSchema, req.params.id);
  const research = await loadResearch(id);
  const events = await prisma.researchEvent.findMany({
    where: { researchId: id },
    include: { actor: { select: { displayName: true } } },
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
  });
  const eventItems: ResearchEventItem[] = events.map((event) => ({
    id: event.id,
    action: event.action,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    note: event.note,
    actorName: event.actor?.displayName ?? null,
    createdAt: event.createdAt.toISOString(),
  }));
  sendSuccess(res, { ...toItem(research), events: eventItems });
});

researchRouter.patch(
  '/research/:id/classification',
  requirePermission('research.manage'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const input = validate(classificationChangeSchema, req.body);
    const research = await loadResearch(id);
    if (research.promotedDormitoryId) {
      throw new ConflictError(
        ERROR_CODES.CONFLICT,
        'Kandidat sudah dipromosikan menjadi data operasional; klasifikasi tidak dapat diubah.',
      );
    }
    if (research.classification === input.classification) {
      throw new ConflictError(ERROR_CODES.CONFLICT, 'Klasifikasi sudah sesuai nilai yang diminta.');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.accommodationResearch.update({
        where: { id },
        data: { classification: input.classification },
        include: researchInclude,
      });
      await tx.researchEvent.create({
        data: {
          researchId: id,
          actorUserId: req.auth!.user.id,
          action: 'CLASSIFICATION_CHANGED',
          fromStatus: research.classification,
          toStatus: input.classification,
          note: input.note,
        },
      });
      return row;
    });

    await writeAudit({
      actorUserId: req.auth!.user.id,
      action: 'RESEARCH_CLASSIFICATION_CHANGE',
      entityType: 'ACCOMMODATION_RESEARCH',
      entityId: id,
      beforeData: { classification: research.classification },
      afterData: { classification: input.classification },
      reason: input.note,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, toItem(updated));
  },
);

async function review(req: Request, res: Response, target: ResearchVerificationStatus): Promise<void> {
  const id = validate(idSchema, req.params.id);
  const input = validate(target === 'REJECTED' ? rejectSchema : reviewSchema, req.body ?? {});
  const research = await loadResearch(id);
  if (research.verificationStatus === target) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      target === 'APPROVED' ? 'Kandidat sudah disetujui.' : 'Kandidat sudah ditolak.',
    );
  }
  if (target === 'REJECTED' && research.promotedDormitoryId) {
    throw new ConflictError(
      ERROR_CODES.CONFLICT,
      'Kandidat sudah dipromosikan menjadi data operasional; penolakan tidak dapat membatalkan promosi.',
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.accommodationResearch.update({
      where: { id },
      data: {
        verificationStatus: target,
        reviewedBy: req.auth!.user.id,
        reviewedAt: new Date(),
      },
      include: researchInclude,
    });
    await tx.researchEvent.create({
      data: {
        researchId: id,
        actorUserId: req.auth!.user.id,
        action: target === 'APPROVED' ? 'APPROVED' : 'REJECTED',
        fromStatus: research.verificationStatus,
        toStatus: target,
        note: input.note ?? null,
      },
    });
    return row;
  });

  await writeAudit({
    actorUserId: req.auth!.user.id,
    action: target === 'APPROVED' ? 'RESEARCH_APPROVE' : 'RESEARCH_REJECT',
    entityType: 'ACCOMMODATION_RESEARCH',
    entityId: id,
    beforeData: { verificationStatus: research.verificationStatus },
    afterData: { verificationStatus: target },
    reason: input.note ?? null,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  sendSuccess(res, toItem(updated));
}

researchRouter.post('/research/:id/approve', requirePermission('research.manage'), (req, res) =>
  review(req, res, 'APPROVED'),
);

researchRouter.post('/research/:id/reject', requirePermission('research.manage'), (req, res) =>
  review(req, res, 'REJECTED'),
);

function dormitoryCodeFromName(name: string): string {
  const slug = name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `RSCH-${slug || 'KANDIDAT'}`;
}

researchRouter.post(
  '/research/:id/promote',
  requirePermission('research.manage'),
  async (req, res) => {
    const id = validate(idSchema, req.params.id);
    const research = await loadResearch(id);
    if (research.promotedDormitoryId) {
      throw new ConflictError(
        ERROR_CODES.CONFLICT,
        'Kandidat sudah dipromosikan menjadi dormitory operasional.',
      );
    }
    if (research.classification !== 'VERIFIED_OFFICIAL_KCIC') {
      throw new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Promosi hanya untuk akomodasi resmi KCIC yang terverifikasi (VERIFIED_OFFICIAL_KCIC). ' +
          'Penginapan publik tidak boleh menjadi fasilitas operasional KCIC.',
      );
    }
    if (research.verificationStatus !== 'APPROVED') {
      throw new AppError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        'Kandidat harus disetujui administrator sebelum dipromosikan.',
      );
    }

    const baseCode = dormitoryCodeFromName(research.name);
    let code = baseCode;
    for (let suffix = 2; await prisma.dormitory.findUnique({ where: { code } }); suffix += 1) {
      code = `${baseCode.slice(0, 36)}-${suffix}`;
    }

    const actorId = req.auth!.user.id;
    const { dormitory, updated } = await prisma.$transaction(async (tx) => {
      const created = await tx.dormitory.create({
        data: {
          code,
          name: research.name.slice(0, 150),
          description:
            'Dipromosikan dari hasil riset akomodasi terverifikasi resmi KCIC dan disetujui administrator. ' +
            'Data gedung/lantai/kamar/ranjang belum tersedia dan harus diisi dari sumber resmi.',
          address: research.address,
          latitude: research.latitude,
          longitude: research.longitude,
          stationCode: research.location.code,
          locationId: research.locationId,
          contactName: research.contactName,
          contactPhone: research.contactPhone,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      const row = await tx.accommodationResearch.update({
        where: { id },
        data: { promotedDormitoryId: created.id },
        include: researchInclude,
      });
      await tx.researchEvent.create({
        data: {
          researchId: id,
          actorUserId: actorId,
          action: 'PROMOTED',
          fromStatus: research.verificationStatus,
          toStatus: research.verificationStatus,
          note: `Dormitory operasional ${created.code} dibuat dari kandidat terverifikasi.`,
        },
      });
      return { dormitory: created, updated: row };
    });

    await writeAudit({
      actorUserId: actorId,
      action: 'RESEARCH_PROMOTE',
      entityType: 'ACCOMMODATION_RESEARCH',
      entityId: id,
      afterData: {
        dormitoryId: dormitory.id,
        dormitoryCode: dormitory.code,
        classification: research.classification,
        verificationStatus: research.verificationStatus,
      },
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
    });
    sendSuccess(res, { research: toItem(updated), dormitory: { id: dormitory.id, code: dormitory.code } }, { status: 201 });
  },
);