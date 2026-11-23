import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { prisma } from '../../src/lib/prisma.js';
import { STORAGE_BUCKETS, removeObject } from '../../src/lib/storage.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const createdPhotoIds: string[] = [];
const storageKeys: string[] = [];
let png: Buffer;

async function samplePng() {
  png ??= await sharp({
    create: { width: 96, height: 64, channels: 3, background: '#6b7280' },
  })
    .png()
    .toBuffer();
  return png;
}

const cleanupDormitoryIds: string[] = [];

async function createTestDormitory(suffix: string) {
  const roomType = await prisma.roomType.findFirstOrThrow({
    where: { code: 'DEMO-STD' },
    select: { id: true },
  });
  const dormitory = await prisma.dormitory.create({
    data: {
      code: `TEST-PHOTO-${suffix.slice(0, 8)}-${Date.now().toString().slice(-6)}`,
      name: `TEST Photo Dormitory ${suffix}`,
      status: 'ACTIVE',
    },
    select: { id: true, name: true },
  });
  cleanupDormitoryIds.push(dormitory.id);
  const building = await prisma.building.create({
    data: { dormitoryId: dormitory.id, code: 'A', name: 'TEST Building A' },
    select: { id: true },
  });
  const floor = await prisma.floor.create({
    data: { buildingId: building.id, floorNumber: 1, name: 'Lantai 1' },
    select: { id: true },
  });
  const room = await prisma.room.create({
    data: {
      floorId: floor.id,
      roomTypeId: roomType.id,
      roomNumber: '101',
      name: 'TEST Room 101',
    },
    select: { id: true, roomNumber: true },
  });
  return { dormitory, room };
}

async function uploadPhoto(
  agent: Awaited<ReturnType<typeof loginAs>>['agent'],
  fields: { dormitoryId: string; roomId?: string; category?: string; caption?: string },
  options: { buffer?: Buffer; filename?: string; contentType?: string } = {},
) {
  let request = agent.post('/api/v1/accommodation/photos').field('dormitoryId', fields.dormitoryId);
  if (fields.roomId) request = request.field('roomId', fields.roomId);
  if (fields.category) request = request.field('category', fields.category);
  if (fields.caption) request = request.field('caption', fields.caption);
  const buffer = options.buffer ?? (await samplePng());
  return request.attach('file', buffer, {
    filename: options.filename ?? 'photo.png',
    contentType: options.contentType ?? 'image/png',
  });
}

afterAll(async () => {
  const photos = await prisma.accommodationPhoto.findMany({
    where: { id: { in: createdPhotoIds } },
    select: { objectKey: true, thumbnailKey: true },
  });
  for (const photo of photos) {
    storageKeys.push(photo.objectKey, photo.thumbnailKey);
  }
  for (const key of storageKeys) {
    await removeObject(STORAGE_BUCKETS.assets, key);
  }
  if (createdPhotoIds.length) {
    await prisma.accommodationPhoto.deleteMany({ where: { id: { in: createdPhotoIds } } });
  }
  if (cleanupDormitoryIds.length) {
    await prisma.accommodationPhoto.deleteMany({
      where: { dormitoryId: { in: cleanupDormitoryIds } },
    });
    await prisma.room.deleteMany({
      where: { floor: { building: { dormitoryId: { in: cleanupDormitoryIds } } } },
    });
    await prisma.floor.deleteMany({
      where: { building: { dormitoryId: { in: cleanupDormitoryIds } } },
    });
    await prisma.building.deleteMany({ where: { dormitoryId: { in: cleanupDormitoryIds } } });
    await prisma.dormitory.deleteMany({ where: { id: { in: cleanupDormitoryIds } } });
  }
});

describe('accommodation photo gallery', () => {
  it('uploads, converts to webp, retrieves thumbnails, orders and manages covers', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const { dormitory, room } = await createTestDormitory('lifecycle');

    const first = await uploadPhoto(admin.agent, {
      dormitoryId: dormitory.id,
      category: 'BEDROOM',
      caption: 'Suasana kamar',
    });
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({
      dormitoryId: dormitory.id,
      roomId: null,
      category: 'BEDROOM',
      caption: 'Suasana kamar',
      isCover: true,
      url: expect.stringContaining('/image'),
      thumbnailUrl: expect.stringContaining('size=thumb'),
    });
    expect(first.body.data.width).toBeGreaterThan(0);
    createdPhotoIds.push(first.body.data.id);

    const second = await uploadPhoto(
      admin.agent,
      { dormitoryId: dormitory.id, roomId: room.id, category: 'BATHROOM' },
      { filename: 'kamar-mandi.png' },
    );
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({
      roomId: room.id,
      roomNumber: room.roomNumber,
      isCover: true,
    });
    expect(second.body.data.roomTypeName).toBeTruthy();
    createdPhotoIds.push(second.body.data.id);

    const third = await uploadPhoto(admin.agent, {
      dormitoryId: dormitory.id,
      roomId: room.id,
      category: 'WARDROBE',
    });
    expect(third.status).toBe(201);
    expect(third.body.data.isCover).toBe(false);
    createdPhotoIds.push(third.body.data.id);

    const full = await admin.agent.get(first.body.data.url);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toContain('image/webp');
    expect(full.headers['cache-control']).toContain('private');

    const thumb = await admin.agent.get(second.body.data.thumbnailUrl);
    expect(thumb.status).toBe(200);
    expect(thumb.headers['content-type']).toContain('image/webp');

    const gallery = await admin.agent
      .get('/api/v1/accommodation/gallery')
      .query({ dormitoryId: dormitory.id });
    expect(gallery.status).toBe(200);
    const item = gallery.body.data.items[0];
    expect(item.coverPhoto.id).toBe(first.body.data.id);
    expect(item.photos).toHaveLength(3);
    const roomTypeEntry = item.roomTypes.find(
      (entry: { photos: Array<{ id: string }> }) =>
        entry.photos.some((photo) => photo.id === second.body.data.id),
    );
    expect(roomTypeEntry).toBeTruthy();

    const reorder = await admin.agent
      .post('/api/v1/accommodation/photos/reorder')
      .send({
        dormitoryId: dormitory.id,
        roomId: room.id,
        orderedIds: [third.body.data.id, second.body.data.id],
      });
    expect(reorder.status).toBe(200);
    const reordered = await prisma.accommodationPhoto.findMany({
      where: { id: { in: [second.body.data.id, third.body.data.id] } },
      select: { id: true, sortOrder: true },
    });
    const sortByPhoto = new Map(reordered.map((row) => [row.id, row.sortOrder]));
    expect(sortByPhoto.get(third.body.data.id)).toBe(0);
    expect(sortByPhoto.get(second.body.data.id)).toBe(1);

    const coverSwitch = await admin.agent
      .patch(`/api/v1/accommodation/photos/${third.body.data.id}`)
      .send({ isCover: true, caption: 'Lemari kamar' });
    expect(coverSwitch.status).toBe(200);
    expect(coverSwitch.body.data.isCover).toBe(true);
    const roomCovers = await prisma.accommodationPhoto.count({
      where: { roomId: room.id, isCover: true },
    });
    expect(roomCovers).toBe(1);

    const deleteCover = await admin.agent.delete(
      `/api/v1/accommodation/photos/${third.body.data.id}`,
    );
    expect(deleteCover.status).toBe(200);
    createdPhotoIds.splice(createdPhotoIds.indexOf(third.body.data.id), 1);
    const promoted = await prisma.accommodationPhoto.findUniqueOrThrow({
      where: { id: second.body.data.id },
      select: { isCover: true },
    });
    expect(promoted.isCover).toBe(true);
  });

  it('enforces management permission and dormitory scope', async () => {
    const { dormitory } = await createTestDormitory('authz');
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const housekeeping = await loginAs(DEMO_ACCOUNTS.housekeeping);
    const karawangManager = await loginAs('manager.karawang@demo.whoosh-stay.local');

    const crewUpload = await uploadPhoto(crew.agent, { dormitoryId: dormitory.id });
    expect(crewUpload.status).toBe(403);
    const hkUpload = await uploadPhoto(housekeeping.agent, { dormitoryId: dormitory.id });
    expect(hkUpload.status).toBe(403);

    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const created = await uploadPhoto(admin.agent, { dormitoryId: dormitory.id });
    expect(created.status).toBe(201);
    createdPhotoIds.push(created.body.data.id);

    const scopedUpload = await uploadPhoto(karawangManager.agent, { dormitoryId: dormitory.id });
    expect(scopedUpload.status).toBe(403);
    const scopedDelete = await karawangManager.agent.delete(
      `/api/v1/accommodation/photos/${created.body.data.id}`,
    );
    expect(scopedDelete.status).toBe(403);

    const crewGallery = await crew.agent
      .get('/api/v1/accommodation/gallery')
      .query({ dormitoryId: dormitory.id });
    expect(crewGallery.status).toBe(200);
    const crewImage = await crew.agent.get(created.body.data.thumbnailUrl);
    expect(crewImage.status).toBe(200);
  });

  it('rejects forged, unsupported and mismatched uploads', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const { dormitory } = await createTestDormitory('validation');
    const { dormitory: otherDormitory, room: otherRoom } = await createTestDormitory('validation-other');

    const forged = await uploadPhoto(
      admin.agent,
      { dormitoryId: dormitory.id },
      {
        buffer: Buffer.from('this is not an image'),
        filename: 'fake.png',
        contentType: 'image/png',
      },
    );
    expect(forged.status).toBe(415);

    const pdf = await uploadPhoto(
      admin.agent,
      { dormitoryId: dormitory.id },
      { buffer: Buffer.from('%PDF-1.4 test'), filename: 'doc.pdf', contentType: 'application/pdf' },
    );
    expect(pdf.status).toBe(415);

    const mismatched = await uploadPhoto(
      admin.agent,
      { dormitoryId: dormitory.id, roomId: otherRoom.id },
    );
    expect(mismatched.status).toBe(400);
    expect(otherDormitory.id).not.toBe(dormitory.id);
  });

  it('returns a null cover for dormitories without photos (web fallback path)', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const { dormitory } = await createTestDormitory('fallback');
    const response = await admin.agent
      .get('/api/v1/accommodation/gallery')
      .query({ dormitoryId: dormitory.id });
    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.items[0]).toMatchObject({
      dormitoryId: dormitory.id,
      coverPhoto: null,
      photos: [],
    });
    expect(response.body.data.items[0].roomTypes[0].photos).toEqual([]);
  });

  it('returns 404 when the stored object is missing', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const { dormitory } = await createTestDormitory('missing');
    const created = await uploadPhoto(admin.agent, { dormitoryId: dormitory.id });
    expect(created.status).toBe(201);
    const photoId = created.body.data.id as string;
    createdPhotoIds.push(photoId);

    const row = await prisma.accommodationPhoto.findUniqueOrThrow({
      where: { id: photoId },
      select: { objectKey: true, thumbnailKey: true },
    });
    await removeObject(STORAGE_BUCKETS.assets, row.objectKey);
    await removeObject(STORAGE_BUCKETS.assets, row.thumbnailKey);

    const response = await admin.agent.get(created.body.data.url);
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('ATTACHMENT_OBJECT_MISSING');
  });
});
