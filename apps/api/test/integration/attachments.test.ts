import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { STORAGE_BUCKETS, removeObject } from '../../src/lib/storage.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const createdAttachmentIds: string[] = [];
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

async function maintenanceTicketId() {
  const ticket = await prisma.maintenanceTicket.findFirstOrThrow({ select: { id: true } });
  return ticket.id;
}

async function housekeepingTaskId() {
  const task = await prisma.housekeepingTask.findFirstOrThrow({ select: { id: true } });
  return task.id;
}

async function crewReservation() {
  const crewEmployee = await prisma.employee.findFirstOrThrow({
    where: { employeeCode: 'DEMO-CREW-0001' },
    select: { id: true },
  });
  const reservation = await prisma.reservation.findFirstOrThrow({
    where: { guests: { some: { employeeId: crewEmployee.id } } },
    select: { id: true },
  });
  return reservation.id;
}

async function upload(
  agent: Awaited<ReturnType<typeof loginAs>>['agent'],
  entityType: string,
  entityId: string,
  options: { buffer?: Buffer; filename?: string; contentType?: string } = {},
) {
  return agent
    .post('/api/v1/attachments')
    .field('entityType', entityType)
    .field('entityId', entityId)
    .attach('file', options.buffer ?? png, {
      filename: options.filename ?? `${entityType.toLowerCase()}.png`,
      contentType: options.contentType ?? 'image/png',
    });
}

afterAll(async () => {
  if (createdAttachmentIds.length) {
    await prisma.attachment.deleteMany({ where: { id: { in: createdAttachmentIds } } });
  }
});

describe('attachment security and lifecycle', () => {
  it('uploads, lists, downloads and deletes maintenance evidence', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const ticketId = await maintenanceTicketId();

    const created = await upload(admin.agent, 'MAINTENANCE_TICKET', ticketId, {
      filename: '../../Evil Photo.png',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.originalFilename).toBe('Evil Photo.png');
    expect(created.body.data.mimeType).toBe('image/png');
    expect(created.body.data.sizeBytes).toBe(png.length);
    expect(created.body.data.downloadUrl).toBe(
      `/api/v1/attachments/${created.body.data.id}/download`,
    );
    createdAttachmentIds.push(created.body.data.id);

    const listed = await admin.agent
      .get('/api/v1/attachments')
      .query({ entityType: 'MAINTENANCE_TICKET', entityId: ticketId });
    expect(listed.status).toBe(200);
    expect(listed.body.data.map((item: { id: string }) => item.id)).toContain(
      created.body.data.id,
    );

    const download = await admin.agent.get(created.body.data.downloadUrl);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toContain('image/png');
    expect(download.headers['content-disposition']).toContain('attachment;');
    expect(download.headers['cache-control']).toContain('no-store');
    expect(Buffer.compare(download.body, png)).toBe(0);

    const deleted = await admin.agent.delete(`/api/v1/attachments/${created.body.data.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toMatchObject({ deleted: true, objectDeleted: true });
    createdAttachmentIds.splice(createdAttachmentIds.indexOf(created.body.data.id), 1);

    const afterDelete = await admin.agent.get(`/api/v1/attachments/${created.body.data.id}`);
    expect(afterDelete.status).toBe(404);
    const audit = await prisma.auditLog.findFirst({
      where: { action: 'ATTACHMENT_DELETE', entityId: created.body.data.id },
    });
    expect(audit).not.toBeNull();
  });

  it('rejects forged, unsupported and oversized files without persisting metadata', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const ticketId = await maintenanceTicketId();
    const before = await prisma.attachment.count();

    const forged = await upload(admin.agent, 'MAINTENANCE_TICKET', ticketId, {
      buffer: Buffer.from('not really a png'),
      filename: 'fake.png',
    });
    expect(forged.status).toBe(415);
    expect(forged.body.error.code).toBe('ATTACHMENT_TYPE_NOT_ALLOWED');

    const mismatch = await upload(admin.agent, 'MAINTENANCE_TICKET', ticketId, {
      buffer: png,
      filename: 'mismatch.png',
      contentType: 'text/plain',
    });
    expect(mismatch.status).toBe(415);

    const oversized = await upload(admin.agent, 'MAINTENANCE_TICKET', ticketId, {
      buffer: Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]),
      filename: 'huge.png',
    });
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe('ATTACHMENT_TOO_LARGE');

    expect(await prisma.attachment.count()).toBe(before);
  });

  it('enforces upload and download authorization', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const crew2 = await loginAs(DEMO_ACCOUNTS.crew2);
    const ticketId = await maintenanceTicketId();

    const crewUpload = await upload(crew.agent, 'MAINTENANCE_TICKET', ticketId);
    expect(crewUpload.status).toBe(403);

    const created = await upload(admin.agent, 'MAINTENANCE_TICKET', ticketId);
    expect(created.status).toBe(201);
    createdAttachmentIds.push(created.body.data.id);

    const crewDownload = await crew.agent.get(created.body.data.downloadUrl);
    expect(crewDownload.status).toBe(403);

    const reservationId = await crewReservation();
    const crewUploadOwn = await upload(crew.agent, 'RESERVATION', reservationId);
    expect(crewUploadOwn.status).toBe(201);
    createdAttachmentIds.push(crewUploadOwn.body.data.id);

    const crewDownloadOwn = await crew.agent.get(crewUploadOwn.body.data.downloadUrl);
    expect(crewDownloadOwn.status).toBe(200);

    const otherCrewDownload = await crew2.agent.get(crewUploadOwn.body.data.downloadUrl);
    expect(otherCrewDownload.status).toBe(403);
  });

  it('deduplicates identical uploads and reports missing stored objects', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const taskId = await housekeepingTaskId();

    const first = await upload(admin.agent, 'HOUSEKEEPING_TASK', taskId);
    expect(first.status).toBe(201);
    createdAttachmentIds.push(first.body.data.id);

    const duplicate = await upload(admin.agent, 'HOUSEKEEPING_TASK', taskId);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data.id).toBe(first.body.data.id);
    const rows = await prisma.attachment.findMany({
      where: { entityType: 'HOUSEKEEPING_TASK', entityId: taskId, checksum: first.body.data.checksum },
    });
    expect(rows).toHaveLength(1);

    const row = await prisma.attachment.findUniqueOrThrow({ where: { id: first.body.data.id } });
    await removeObject(STORAGE_BUCKETS.evidence, row.objectKey);

    const missing = await admin.agent.get(`/api/v1/attachments/${row.id}/download`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('ATTACHMENT_OBJECT_MISSING');
  });

  it('restricts operational documents to global reporting roles', async () => {
    const admin = await loginAs(DEMO_ACCOUNTS.admin);
    const auditor = await loginAs(DEMO_ACCOUNTS.auditor);
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const scopeId = '00000000-0000-0000-0000-000000000000';
    const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF');

    const crewUpload = await upload(crew.agent, 'OPERATIONAL_DOCUMENT', scopeId, {
      buffer: pdf,
      filename: 'policy.pdf',
      contentType: 'application/pdf',
    });
    expect(crewUpload.status).toBe(403);

    const created = await upload(admin.agent, 'OPERATIONAL_DOCUMENT', scopeId, {
      buffer: pdf,
      filename: 'policy.pdf',
      contentType: 'application/pdf',
    });
    expect(created.status).toBe(201);
    createdAttachmentIds.push(created.body.data.id);

    const auditorDownload = await auditor.agent.get(created.body.data.downloadUrl);
    expect(auditorDownload.status).toBe(200);
    expect(auditorDownload.headers['content-type']).toContain('application/pdf');
  });
});
