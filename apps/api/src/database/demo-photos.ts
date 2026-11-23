import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp, { type Sharp } from 'sharp';
import type { PrismaClient } from '@prisma/client';
import { STORAGE_BUCKETS, putObject } from '../lib/storage.js';
import { logger } from '../lib/logger.js';

interface DemoPhotoSet {
  dormitoryCode: string;
  slug: string;
  area: string;
}

const DEMO_PHOTO_SETS: DemoPhotoSet[] = [
  { dormitoryCode: 'DEMO-DORM-01', slug: 'halim', area: 'Halim' },
  { dormitoryCode: 'DEMO-DORM-02', slug: 'karawang', area: 'Karawang' },
  { dormitoryCode: 'DEMO-DORM-03', slug: 'padalarang', area: 'Padalarang' },
  { dormitoryCode: 'DEMO-DORM-04', slug: 'tegalluar', area: 'Tegalluar' },
  { dormitoryCode: 'DEMO-DORM-05', slug: 'depo501', area: 'Depo 501' },
];

const ASSET_DIR = resolve(process.cwd(), 'prisma/demo-photos/web');

type RoomScene = {
  source: 'bedroom' | 'bathroom' | 'workspace';
  category: 'BEDROOM' | 'BATHROOM' | 'DESK' | 'WARDROBE' | 'BED';
  caption: string;
  focus: 'center' | 'left' | 'right';
};

const ROOM_SCENES: RoomScene[] = [
  { source: 'bedroom', category: 'BEDROOM', caption: 'Kamar tidur kru', focus: 'center' },
  { source: 'bedroom', category: 'BED', caption: 'Tempat tidur', focus: 'left' },
  { source: 'bathroom', category: 'BATHROOM', caption: 'Kamar mandi', focus: 'center' },
  { source: 'workspace', category: 'DESK', caption: 'Meja kerja', focus: 'left' },
  { source: 'workspace', category: 'WARDROBE', caption: 'Lemari pakaian', focus: 'right' },
];

const FOCUS_X: Record<RoomScene['focus'], number[]> = {
  center: [0.5, 0.45, 0.55, 0.5],
  left: [0.15, 0.25, 0.1, 0.3],
  right: [0.85, 0.75, 0.9, 0.7],
};

function cropForRoom(
  image: Sharp,
  width: number,
  height: number,
  focus: RoomScene['focus'],
  roomIndex: number,
) {
  const zoom = 0.62 + (roomIndex % 4) * 0.07;
  const cropWidth = Math.max(64, Math.round(width * zoom));
  const cropHeight = Math.max(64, Math.round(height * zoom));
  const maxLeft = Math.max(0, width - cropWidth);
  const maxTop = Math.max(0, height - cropHeight);
  const candidates = FOCUS_X[focus];
  const left = Math.round(maxLeft * candidates[roomIndex % candidates.length]);
  const top = Math.round(maxTop * (0.3 + (roomIndex % 3) * 0.15));
  return image.extract({ left, top, width: cropWidth, height: cropHeight });
}

export async function seedDemoPhotos(prisma: PrismaClient): Promise<{ photos: number; skipped: boolean }> {
  let created = 0;
  let skipped = true;

  for (const set of DEMO_PHOTO_SETS) {
    const folder = resolve(ASSET_DIR, set.slug);
    if (!existsSync(folder)) {
      logger.warn({ slug: set.slug }, 'demo photo assets missing');
      continue;
    }
    const dormitory = await prisma.dormitory.findUnique({
      where: { code: set.dormitoryCode },
      include: {
        buildings: {
          include: {
            floors: {
              include: { rooms: { orderBy: [{ roomNumber: 'asc' }] } },
            },
          },
        },
      },
    });
    if (!dormitory) continue;

    const existing = await prisma.accommodationPhoto.count({
      where: { dormitoryId: dormitory.id },
    });
    if (existing > 0) {
      continue;
    }
    skipped = false;

    const rooms = dormitory.buildings.flatMap((building) =>
      building.floors.flatMap((floor) => floor.rooms),
    );

    try {
      for (const scene of ['cover', 'facility'] as const) {
        const fullPath = resolve(folder, `${scene}.webp`);
        const thumbPath = resolve(folder, `${scene}-thumb.webp`);
        if (!existsSync(fullPath) || !existsSync(thumbPath)) continue;
        const full = readFileSync(fullPath);
        const thumb = readFileSync(thumbPath);
        const metadata = await sharp(full).metadata();
        const objectKey = `gallery/demo/${set.slug}/dormitory/${scene}.webp`;
        const thumbnailKey = `gallery/demo/${set.slug}/dormitory/${scene}-thumb.webp`;
        await putObject(STORAGE_BUCKETS.assets, objectKey, full, 'image/webp');
        await putObject(STORAGE_BUCKETS.assets, thumbnailKey, thumb, 'image/webp');
        await prisma.accommodationPhoto.create({
          data: {
            id: randomUUID(),
            dormitoryId: dormitory.id,
            roomId: null,
            category: scene === 'cover' ? 'BEDROOM' : 'FACILITY',
            caption:
              scene === 'cover'
                ? `Fasad ${set.area} (foto demo sintetis)`
                : `Area bersama ${set.area} (foto demo sintetis)`,
            sortOrder: scene === 'cover' ? 0 : 1,
            isCover: scene === 'cover',
            objectKey,
            thumbnailKey,
            mimeType: 'image/webp',
            width: metadata.width ?? 1600,
            height: metadata.height ?? 1067,
            sizeBytes: BigInt(full.byteLength),
            originalFilename: `demo-${set.slug}-${scene}.webp`,
          },
        });
        created += 1;
      }

      for (const [roomIndex, room] of rooms.entries()) {
        for (const [sceneIndex, scene] of ROOM_SCENES.entries()) {
          const sourcePath = resolve(folder, `${scene.source}.webp`);
          const metadata = await sharp(sourcePath).metadata();
          const sourceWidth = metadata.width ?? 1600;
          const sourceHeight = metadata.height ?? 1067;
          const full = await cropForRoom(
            sharp(sourcePath),
            sourceWidth,
            sourceHeight,
            scene.focus,
            roomIndex,
          )
            .resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer({ resolveWithObject: true });
          const thumb = await cropForRoom(
            sharp(sourcePath),
            sourceWidth,
            sourceHeight,
            scene.focus,
            roomIndex,
          )
            .resize({ width: 640, height: 480, fit: 'cover' })
            .webp({ quality: 72 })
            .toBuffer();

          const categoryKey = scene.category.toLowerCase();
          const objectKey = `gallery/demo/${set.slug}/${room.id}/${categoryKey}.webp`;
          const thumbnailKey = `gallery/demo/${set.slug}/${room.id}/${categoryKey}-thumb.webp`;
          await putObject(STORAGE_BUCKETS.assets, objectKey, full.data, 'image/webp');
          await putObject(STORAGE_BUCKETS.assets, thumbnailKey, thumb, 'image/webp');
          await prisma.accommodationPhoto.create({
            data: {
              id: randomUUID(),
              dormitoryId: dormitory.id,
              roomId: room.id,
              category: scene.category,
              caption: `${scene.caption} ${set.area} (foto demo sintetis)`,
              sortOrder: sceneIndex,
              isCover: sceneIndex === 0,
              objectKey,
              thumbnailKey,
              mimeType: 'image/webp',
              width: full.info.width,
              height: full.info.height,
              sizeBytes: BigInt(full.data.byteLength),
              originalFilename: `demo-${set.slug}-${room.roomNumber}-${categoryKey}.webp`,
            },
          });
          created += 1;
        }
      }
    } catch (error) {
      logger.warn({ err: error, slug: set.slug }, 'demo photo seeding skipped');
      // Roll back metadata for this set so a later run can retry cleanly.
      await prisma.accommodationPhoto.deleteMany({ where: { dormitoryId: dormitory.id } });
    }
  }

  return { photos: created, skipped };
}
