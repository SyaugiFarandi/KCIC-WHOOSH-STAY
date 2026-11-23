import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

const PREFIX = 'E2E-RSCH';

async function createCandidate(
  overrides: Partial<{ classification: string; verificationStatus: string }> = {},
) {
  const location = await prisma.location.findUnique({ where: { code: 'HALIM' } });
  if (!location) throw new Error('Lokasi HALIM tidak ada di fixture test.');
  return prisma.accommodationResearch.create({
    data: {
      locationId: location.id,
      name: `${PREFIX}-${randomUUID().slice(0, 8)}`,
      address: 'Jl. Uji Riset No. 1, Jakarta Timur',
      classification: overrides.classification ?? 'RESEARCH_CANDIDATE',
      verificationStatus: overrides.verificationStatus ?? 'PENDING',
      facilities: ['Wi-Fi', 'Parkir'],
      sources: {
        create: [
          {
            url: 'https://example.invalid/research-source',
            title: 'Sumber uji riset',
            sourceType: 'OTHER',
            checkedAt: new Date('2026-11-22T00:00:00.000Z'),
          },
        ],
      },
    },
  });
}

afterEach(async () => {
  await prisma.accommodationResearch.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.dormitory.deleteMany({ where: { code: { startsWith: 'RSCH-E2E-RSCH' } } });
});

describe('accommodation research', () => {
  it('lists with filters, summary and filter options', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const candidate = await createCandidate({ classification: 'VERIFIED_PUBLIC' });

    const list = await agent.get(`/api/v1/research?q=${candidate.name}&pageSize=10`);
    expect(list.status).toBe(200);
    expect(list.body.data.pagination.total).toBe(1);
    const item = list.body.data.items[0];
    expect(item).toMatchObject({
      id: candidate.id,
      locationCode: 'HALIM',
      classification: 'VERIFIED_PUBLIC',
      verificationStatus: 'PENDING',
      facilities: ['Wi-Fi', 'Parkir'],
    });
    expect(item.sources).toHaveLength(1);
    expect(item.sources[0].checkedAt).toBe('2026-11-22');

    const byLocation = await agent.get('/api/v1/research?locationCode=HALIM&pageSize=50');
    expect(byLocation.status).toBe(200);
    expect(
      byLocation.body.data.items.every(
        (entry: { locationCode: string }) => entry.locationCode === 'HALIM',
      ),
    ).toBe(true);

    const byClassification = await agent.get(
      '/api/v1/research?classification=VERIFIED_OFFICIAL_KCIC&pageSize=50',
    );
    expect(byClassification.status).toBe(200);
    expect(
      byClassification.body.data.items.some((entry: { id: string }) => entry.id === candidate.id),
    ).toBe(false);

    const summary = await agent.get('/api/v1/research/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data.total).toBeGreaterThanOrEqual(1);
    expect(summary.body.data.byClassification.VERIFIED_PUBLIC).toBeGreaterThanOrEqual(1);
    expect(summary.body.data.byVerificationStatus.PENDING).toBeGreaterThanOrEqual(1);
    expect(summary.body.data.byLocation.HALIM).toBeGreaterThanOrEqual(1);

    const options = await agent.get('/api/v1/research/filter-options');
    expect(options.status).toBe(200);
    expect(
      options.body.data.locations.some((location: { code: string }) => location.code === 'HALIM'),
    ).toBe(true);
  });

  it('returns detail with sources and events, and rejects bad ids', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const candidate = await createCandidate();

    const detail = await agent.get(`/api/v1/research/${candidate.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({ id: candidate.id, name: candidate.name });
    expect(detail.body.data.sources).toHaveLength(1);
    expect(detail.body.data.events.length).toBeGreaterThanOrEqual(0);

    const missing = await agent.get('/api/v1/research/00000000-0000-0000-0000-000000000000');
    expect(missing.status).toBe(404);
    const invalid = await agent.get('/api/v1/research/bukan-uuid');
    expect(invalid.status).toBe(400);
  });

  it('approves and rejects with events, audit and conflict guards', async () => {
    const { agent, body } = await loginAs(DEMO_ACCOUNTS.admin);
    const candidate = await createCandidate();

    const approve = await agent
      .post(`/api/v1/research/${candidate.id}/approve`)
      .send({ note: 'Sumber sudah ditinjau.' });
    expect(approve.status).toBe(200);
    expect(approve.body.data).toMatchObject({
      verificationStatus: 'APPROVED',
      reviewedByName: body.data.user.displayName,
    });
    expect(approve.body.data.reviewedAt).toBeTruthy();

    const again = await agent.post(`/api/v1/research/${candidate.id}/approve`).send({});
    expect(again.status).toBe(409);

    const rejectWithoutNote = await agent
      .post(`/api/v1/research/${candidate.id}/reject`)
      .send({});
    expect(rejectWithoutNote.status).toBe(400);

    const reject = await agent
      .post(`/api/v1/research/${candidate.id}/reject`)
      .send({ note: 'Bukti tidak cukup.' });
    expect(reject.status).toBe(200);
    expect(reject.body.data.verificationStatus).toBe('REJECTED');

    const rejectAgain = await agent
      .post(`/api/v1/research/${candidate.id}/reject`)
      .send({ note: 'duplikat' });
    expect(rejectAgain.status).toBe(409);

    const detail = await agent.get(`/api/v1/research/${candidate.id}`);
    const actions = detail.body.data.events.map((event: { action: string }) => event.action);
    expect(actions).toContain('APPROVED');
    expect(actions).toContain('REJECTED');

    const audit = await agent.get(
      `/api/v1/admin/audit-logs?actorUserId=${body.data.user.id}&action=RESEARCH_APPROVE&pageSize=10`,
    );
    expect(audit.status).toBe(200);
    expect(
      audit.body.data.items.some((entry: { entityId: string }) => entry.entityId === candidate.id),
    ).toBe(true);
  });

  it('changes classification only with a reason and records history', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);
    const candidate = await createCandidate();

    const withoutNote = await agent
      .patch(`/api/v1/research/${candidate.id}/classification`)
      .send({ classification: 'VERIFIED_PUBLIC' });
    expect(withoutNote.status).toBe(400);

    const sameValue = await agent
      .patch(`/api/v1/research/${candidate.id}/classification`)
      .send({ classification: 'RESEARCH_CANDIDATE', note: 'tetap' });
    expect(sameValue.status).toBe(409);

    const invalidValue = await agent
      .patch(`/api/v1/research/${candidate.id}/classification`)
      .send({ classification: 'VERIFIED_HOAX', note: 'uji' });
    expect(invalidValue.status).toBe(400);

    const changed = await agent
      .patch(`/api/v1/research/${candidate.id}/classification`)
      .send({ classification: 'VERIFIED_PUBLIC', note: 'Alamat dikonfirmasi situs resmi.' });
    expect(changed.status).toBe(200);
    expect(changed.body.data.classification).toBe('VERIFIED_PUBLIC');

    const detail = await agent.get(`/api/v1/research/${candidate.id}`);
    const event = detail.body.data.events.find(
      (entry: { action: string }) => entry.action === 'CLASSIFICATION_CHANGED',
    );
    expect(event).toMatchObject({
      fromStatus: 'RESEARCH_CANDIDATE',
      toStatus: 'VERIFIED_PUBLIC',
    });
  });

  it('promotes only verified official KCIC candidates that are approved, without fabricating hierarchy', async () => {
    const { agent } = await loginAs(DEMO_ACCOUNTS.admin);

    const publicCandidate = await createCandidate({ classification: 'VERIFIED_PUBLIC' });
    await agent.post(`/api/v1/research/${publicCandidate.id}/approve`).send({});
    const publicPromote = await agent.post(`/api/v1/research/${publicCandidate.id}/promote`);
    expect(publicPromote.status).toBe(400);
    expect(publicPromote.body.error.message).toContain('VERIFIED_OFFICIAL_KCIC');

    const official = await createCandidate({ classification: 'VERIFIED_OFFICIAL_KCIC' });
    const pendingPromote = await agent.post(`/api/v1/research/${official.id}/promote`);
    expect(pendingPromote.status).toBe(400);

    await agent.post(`/api/v1/research/${official.id}/approve`).send({ note: 'Bukti resmi OK.' });
    const promoted = await agent.post(`/api/v1/research/${official.id}/promote`);
    expect(promoted.status).toBe(201);
    const dormitoryId = promoted.body.data.dormitory.id as string;
    expect(promoted.body.data.research.promotedDormitoryId).toBe(dormitoryId);

    const dormitory = await prisma.dormitory.findUnique({
      where: { id: dormitoryId },
      include: { _count: { select: { buildings: true } } },
    });
    expect(dormitory).toMatchObject({
      name: official.name,
      stationCode: 'HALIM',
      locationId: official.locationId,
    });
    expect(dormitory?._count.buildings).toBe(0);
    const rooms = await prisma.room.count({
      where: { floor: { building: { dormitoryId } } },
    });
    expect(rooms).toBe(0);

    const promoteAgain = await agent.post(`/api/v1/research/${official.id}/promote`);
    expect(promoteAgain.status).toBe(409);
    const rejectPromoted = await agent
      .post(`/api/v1/research/${official.id}/reject`)
      .send({ note: 'coba batalkan' });
    expect(rejectPromoted.status).toBe(409);
    const reclassifyPromoted = await agent
      .patch(`/api/v1/research/${official.id}/classification`)
      .send({ classification: 'VERIFIED_PUBLIC', note: 'coba ubah' });
    expect(reclassifyPromoted.status).toBe(409);
  });

  it('enforces RBAC: crew has no access, manager reads but cannot manage', async () => {
    const candidate = await createCandidate();

    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const crewList = await crew.agent.get('/api/v1/research');
    expect([401, 403]).toContain(crewList.status);
    const crewDetail = await crew.agent.get(`/api/v1/research/${candidate.id}`);
    expect([401, 403]).toContain(crewDetail.status);
    const crewApprove = await crew.agent
      .post(`/api/v1/research/${candidate.id}/approve`)
      .send({});
    expect([401, 403]).toContain(crewApprove.status);

    const manager = await loginAs(DEMO_ACCOUNTS.manager);
    const managerList = await manager.agent.get('/api/v1/research');
    expect(managerList.status).toBe(200);
    const managerApprove = await manager.agent
      .post(`/api/v1/research/${candidate.id}/approve`)
      .send({});
    expect(managerApprove.status).toBe(403);
    const managerPromote = await manager.agent.post(`/api/v1/research/${candidate.id}/promote`);
    expect(managerPromote.status).toBe(403);
  });
});