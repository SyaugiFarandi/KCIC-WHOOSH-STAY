import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  AvailabilityResult,
  PolicyDetail,
  PolicyEvaluationLogResult,
  PolicyEvaluationResult,
  PolicyListResult,
  PolicyVersionEntry,
  ReservationDetail,
} from '@whoosh/shared';
import { prisma } from '../../src/lib/prisma.js';
import { DEMO_ACCOUNTS, loginAs } from './helpers.js';

type Agent = Awaited<ReturnType<typeof loginAs>>['agent'];

const CODE_PREFIX = 'INT_POL_';
let sequence = 0;

function isoDate(offsetDays: number): string {
  const base = new Date(Date.now() + 7 * 3_600_000);
  base.setUTCHours(0, 0, 0, 0);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  return base.toISOString().slice(0, 10);
}

function nextCode(): string {
  sequence += 1;
  return `${CODE_PREFIX}${Date.now()}_${sequence}`;
}

const createdPolicyIds: string[] = [];
const createdReservationIds: string[] = [];

async function createPolicy(
  admin: Agent,
  overrides: Record<string, unknown> = {},
): Promise<PolicyDetail> {
  const code = nextCode();
  const response = await admin.post('/api/v1/policy-engine/policies').send({
    code,
    name: `Kebijakan integrasi ${code}`,
    description: 'Dibuat oleh integration test Phase C.',
    category: 'MAX_STAY_DURATION',
    effect: 'DENY',
    severity: 'MEDIUM',
    priority: 100,
    effectiveFrom: isoDate(-1),
    parameters: { maxNights: 2 },
    conditions: {},
    ...overrides,
  });
  expect(response.status, response.text).toBe(201);
  const detail = response.body.data as PolicyDetail;
  createdPolicyIds.push(detail.id);
  return detail;
}

async function approveAndActivate(admin: Agent, id: string): Promise<PolicyDetail> {
  const approved = await admin
    .post(`/api/v1/policy-engine/policies/${id}/approve`)
    .send({ note: 'Disetujui untuk pengujian integrasi' });
  expect(approved.status, approved.text).toBe(200);
  const activated = await admin.post(`/api/v1/policy-engine/policies/${id}/activate`).send({});
  expect(activated.status, activated.text).toBe(200);
  return activated.body.data as PolicyDetail;
}

async function deactivate(admin: Agent, id: string): Promise<void> {
  const response = await admin.post(`/api/v1/policy-engine/policies/${id}/deactivate`).send({});
  expect(response.status, response.text).toBe(200);
}

async function cleanupReservation(id: string): Promise<void> {
  await prisma.housekeepingTask.deleteMany({ where: { reservationId: id } });
  await prisma.bedAllocation.deleteMany({ where: { reservationId: id } });
  await prisma.reservation.deleteMany({ where: { id } });
}

async function availability(agent: Agent, checkIn: string, checkOut: string) {
  const response = await agent.get(
    `/api/v1/availability?checkIn=${checkIn}&checkOut=${checkOut}`,
  );
  expect(response.status).toBe(200);
  return response.body.data as AvailabilityResult;
}

afterAll(async () => {
  for (const id of createdReservationIds) {
    await cleanupReservation(id);
  }
  await prisma.policyEvaluation.deleteMany({
    where: { policyCode: { startsWith: CODE_PREFIX } },
  });
  await prisma.reservationException.deleteMany({
    where: { dedupeKey: { startsWith: `POLICY_VIOLATION:${CODE_PREFIX}` } },
  });
  await prisma.accommodationPolicy.deleteMany({
    where: { code: { startsWith: CODE_PREFIX } },
  });
});

describe('accommodation policy engine', () => {
  let admin: Awaited<ReturnType<typeof loginAs>>;
  let manager: Awaited<ReturnType<typeof loginAs>>;
  let employeeId: string;

  beforeAll(async () => {
    admin = await loginAs(DEMO_ACCOUNTS.admin);
    manager = await loginAs(DEMO_ACCOUNTS.manager);

    const dormitory = await prisma.dormitory.findFirstOrThrow({ where: { code: 'DEMO-DORM-01' } });
    const rooms = await prisma.room.findMany({
      where: { floor: { building: { dormitoryId: dormitory.id } } },
      select: { id: true },
    });
    const roomIds = rooms.map((room) => room.id);
    await prisma.room.updateMany({
      where: { id: { in: roomIds } },
      data: { housekeepingStatus: 'READY', operationalStatus: 'ACTIVE' },
    });
    await prisma.bed.updateMany({
      where: { roomId: { in: roomIds } },
      data: { housekeepingStatus: 'READY', status: 'ACTIVE' },
    });

    const employee = await prisma.employee.findFirstOrThrow({
      where: {
        employmentStatus: 'ACTIVE',
        NOT: { eligibilityStatus: 'INELIGIBLE' },
      },
      orderBy: { employeeCode: 'asc' },
      select: { id: true },
    });
    employeeId = employee.id;
  });

  it('creates, versions, approves, activates and deletes a policy through the API', async () => {
    const created = await createPolicy(admin.agent);
    expect(created).toMatchObject({
      status: 'DRAFT',
      version: 1,
      approved: false,
      category: 'MAX_STAY_DURATION',
    });

    const list = await admin.agent.get(
      `/api/v1/policy-engine/policies?q=${created.code}&category=MAX_STAY_DURATION`,
    );
    expect(list.status).toBe(200);
    const listed = list.body.data as PolicyListResult;
    expect(listed.items.map((item) => item.id)).toContain(created.id);

    const summary = await admin.agent.get('/api/v1/policy-engine/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.data.counts.draft).toBeGreaterThanOrEqual(1);

    const updated = await admin.agent
      .patch(`/api/v1/policy-engine/policies/${created.id}`)
      .send({
        name: 'Kebijakan integrasi versi dua',
        parameters: { maxNights: 4 },
        expectedVersion: 1,
        changeNote: 'Perubahan untuk pengujian versi',
      });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.body.data).toMatchObject({ version: 2, status: 'DRAFT', approved: false });

    const stale = await admin.agent
      .patch(`/api/v1/policy-engine/policies/${created.id}`)
      .send({ name: 'Perubahan basi', expectedVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('POLICY_VERSION_CONFLICT');

    const versions = await admin.agent.get(
      `/api/v1/policy-engine/policies/${created.id}/versions`,
    );
    expect(versions.status).toBe(200);
    const versionRows = versions.body.data as PolicyVersionEntry[];
    expect(versionRows).toHaveLength(2);
    expect(versionRows.every((row) => row.approvedAt === null)).toBe(true);

    const activated = await approveAndActivate(admin.agent, created.id);
    expect(activated.status).toBe('ACTIVE');

    const deleteActive = await admin.agent.delete(
      `/api/v1/policy-engine/policies/${created.id}`,
    );
    expect(deleteActive.status).toBe(409);
    expect(deleteActive.body.error.code).toBe('POLICY_STATE_INVALID');

    await deactivate(admin.agent, created.id);
    const deleted = await admin.agent.delete(`/api/v1/policy-engine/policies/${created.id}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body.data).toEqual({ deleted: true });
    createdPolicyIds.splice(createdPolicyIds.indexOf(created.id), 1);
  });

  it('refuses activation until the current version is approved', async () => {
    const created = await createPolicy(admin.agent);
    const activation = await admin.agent
      .post(`/api/v1/policy-engine/policies/${created.id}/activate`)
      .send({});
    expect(activation.status).toBe(409);
    expect(activation.body.error.code).toBe('POLICY_NOT_APPROVED');

    const shortNote = await admin.agent
      .post(`/api/v1/policy-engine/policies/${created.id}/approve`)
      .send({ note: 'xx' });
    expect(shortNote.status).toBe(400);

    const approved = await admin.agent
      .post(`/api/v1/policy-engine/policies/${created.id}/approve`)
      .send({ note: 'Setuju untuk pengujian' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.approved).toBe(true);
  });

  it('enforces RBAC on policy management endpoints', async () => {
    const crew = await loginAs(DEMO_ACCOUNTS.crew);
    const auditor = await loginAs(DEMO_ACCOUNTS.auditor);

    expect((await manager.agent.get('/api/v1/policy-engine/policies')).status).toBe(200);
    expect((await auditor.agent.get('/api/v1/policy-engine/policies')).status).toBe(200);
    expect((await crew.agent.get('/api/v1/policy-engine/policies')).status).toBe(403);

    const created = await createPolicy(admin.agent);

    const managerCreate = await manager.agent.post('/api/v1/policy-engine/policies').send({
      code: nextCode(),
      name: 'Ditolak untuk manager',
      category: 'MAX_STAY_DURATION',
      effect: 'DENY',
      effectiveFrom: isoDate(0),
      parameters: { maxNights: 3 },
    });
    expect(managerCreate.status).toBe(403);

    const managerEvaluate = await manager.agent.post('/api/v1/policy-engine/evaluate').send({
      workflow: 'RESERVATION_MANUAL',
      checkInDate: isoDate(10),
      checkOutDate: isoDate(12),
    });
    expect(managerEvaluate.status).toBe(200);

    const auditorCreate = await auditor.agent.post('/api/v1/policy-engine/policies').send({
      code: nextCode(),
      name: 'Ditolak untuk auditor',
      category: 'MAX_STAY_DURATION',
      effect: 'DENY',
      effectiveFrom: isoDate(0),
      parameters: { maxNights: 3 },
    });
    expect(auditorCreate.status).toBe(403);

    await prisma.accommodationPolicy.delete({ where: { id: created.id } });
    createdPolicyIds.splice(createdPolicyIds.indexOf(created.id), 1);
  });

  it('simulates active policies and records simulated evaluation logs', async () => {
    const created = await createPolicy(admin.agent, { parameters: { maxNights: 2 } });
    await approveAndActivate(admin.agent, created.id);

    const simulation = await manager.agent.post('/api/v1/policy-engine/evaluate').send({
      workflow: 'RESERVATION_MANUAL',
      policyId: created.id,
      checkInDate: isoDate(20),
      checkOutDate: isoDate(25),
      occupantCount: 1,
    });
    expect(simulation.status, simulation.text).toBe(200);
    const result = simulation.body.data as PolicyEvaluationResult;
    expect(result.decision).toBe('DENIED');
    expect(result.blockingPolicy?.policyCode).toBe(created.code);

    const logs = await manager.agent.get(
      `/api/v1/policy-engine/evaluations?simulated=true&policyId=${created.id}`,
    );
    expect(logs.status).toBe(200);
    const logResult = logs.body.data as PolicyEvaluationLogResult;
    expect(logResult.items.length).toBeGreaterThanOrEqual(1);
    expect(logResult.items[0]).toMatchObject({
      policyCode: created.code,
      simulated: true,
      result: 'DENIED',
      workflow: 'RESERVATION_MANUAL',
    });

    const scoped = await manager.agent.get(
      `/api/v1/policy-engine/evaluations?q=${created.code}`,
    );
    expect(scoped.status).toBe(200);
    expect((scoped.body.data as PolicyEvaluationLogResult).items.length).toBeGreaterThanOrEqual(1);

    await deactivate(admin.agent, created.id);
  });

  it('applies effective dates and skips categories outside their workflow', async () => {
    const current = await createPolicy(admin.agent, { parameters: { maxNights: 2 } });
    const future = await createPolicy(admin.agent, {
      effectiveFrom: isoDate(30),
      parameters: { maxNights: 2 },
    });
    await approveAndActivate(admin.agent, current.id);
    await approveAndActivate(admin.agent, future.id);

    const evaluation = await manager.agent.post('/api/v1/policy-engine/evaluate').send({
      workflow: 'RESERVATION_MANUAL',
      checkInDate: isoDate(35),
      checkOutDate: isoDate(40),
    });
    expect(evaluation.status).toBe(200);
    const result = evaluation.body.data as PolicyEvaluationResult;
    expect(result.decision).toBe('DENIED');
    expect(result.evaluations.some((line) => line.policyCode === current.code)).toBe(true);
    expect(result.evaluations.some((line) => line.policyCode === future.code)).toBe(false);

    const cancellationOnly = await createPolicy(admin.agent, {
      category: 'CANCELLATION',
      effect: 'DENY',
      parameters: {},
    });
    await approveAndActivate(admin.agent, cancellationOnly.id);
    const reservation = await manager.agent.post('/api/v1/policy-engine/evaluate').send({
      workflow: 'RESERVATION_MANUAL',
      checkInDate: isoDate(10),
      checkOutDate: isoDate(12),
    });
    expect((reservation.body.data as PolicyEvaluationResult).evaluations).not.toContainEqual(
      expect.objectContaining({ policyCode: cancellationOnly.code }),
    );

    await deactivate(admin.agent, current.id);
    await deactivate(admin.agent, future.id);
    await deactivate(admin.agent, cancellationOnly.id);
  });

  it('denies reservation creation before any reservation is committed', async () => {
    const deny = await createPolicy(admin.agent, {
      category: 'DORMITORY_ASSIGNMENT',
      effect: 'DENY',
      parameters: {},
    });
    await approveAndActivate(admin.agent, deny.id);

    const checkIn = isoDate(40);
    const checkOut = isoDate(42);
    const available = await availability(manager.agent, checkIn, checkOut);
    const dormitory = available.dormitories.find((item) => item.availableBeds > 0);
    expect(dormitory).toBeTruthy();

    const denied = await manager.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory!.dormitoryId,
      employeeIds: [employeeId],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      autoConfirm: true,
    });
    expect(denied.status).toBe(409);
    expect(denied.body.error.code).toBe('POLICY_DENIED');

    const persisted = await prisma.reservation.count({
      where: {
        dormitoryId: dormitory!.dormitoryId,
        checkInDate: new Date(checkIn),
        checkOutDate: new Date(checkOut),
        primaryEmployeeId: employeeId,
      },
    });
    expect(persisted).toBe(0);

    const logged = await prisma.policyEvaluation.count({
      where: { policyCode: deny.code, simulated: false, result: 'DENIED' },
    });
    expect(logged).toBeGreaterThanOrEqual(1);

    await deactivate(admin.agent, deny.id);
  });

  it('converts auto-confirm reservations to pending when a policy requires approval', async () => {
    const approval = await createPolicy(admin.agent, {
      category: 'BED_CAPACITY',
      effect: 'REQUIRES_APPROVAL',
      parameters: {},
    });
    await approveAndActivate(admin.agent, approval.id);

    const checkIn = isoDate(50);
    const checkOut = isoDate(52);
    const available = await availability(manager.agent, checkIn, checkOut);
    const dormitory = available.dormitories.find((item) => item.availableBeds > 0);
    expect(dormitory).toBeTruthy();

    const created = await manager.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory!.dormitoryId,
      employeeIds: [employeeId],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      autoConfirm: true,
      idempotencyKey: `policy-approval-${Date.now()}`,
    });
    expect(created.status, created.text).toBe(201);
    const detail = created.body.data as ReservationDetail;
    createdReservationIds.push(detail.id);
    expect(detail.status).toBe('PENDING_APPROVAL');
    expect(detail.approvalStatus).toBe('PENDING');

    const exception = await prisma.reservationException.findFirst({
      where: { dedupeKey: { contains: approval.code } },
    });
    expect(exception).toMatchObject({
      exceptionType: 'POLICY_VIOLATION',
      reservationId: detail.id,
    });

    await deactivate(admin.agent, approval.id);
  });

  it('blocks cancellation and records one deduplicated policy violation exception', async () => {
    const checkIn = isoDate(60);
    const checkOut = isoDate(62);
    const available = await availability(manager.agent, checkIn, checkOut);
    const dormitory = available.dormitories.find((item) => item.availableBeds > 0);
    expect(dormitory).toBeTruthy();

    const created = await manager.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory!.dormitoryId,
      employeeIds: [employeeId],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      autoConfirm: true,
      idempotencyKey: `policy-cancel-${Date.now()}`,
    });
    expect(created.status, created.text).toBe(201);
    const detail = created.body.data as ReservationDetail;
    createdReservationIds.push(detail.id);
    expect(detail.status).toBe('CONFIRMED');

    const denyCancel = await createPolicy(admin.agent, {
      category: 'CANCELLATION',
      effect: 'DENY',
      parameters: {},
    });
    await approveAndActivate(admin.agent, denyCancel.id);

    const first = await manager.agent
      .post(`/api/v1/reservations/${detail.id}/cancel`)
      .send({ reason: 'Pengujian kebijakan pembatalan' });
    expect(first.status).toBe(409);
    expect(first.body.error.code).toBe('POLICY_DENIED');

    const repeat = await manager.agent
      .post(`/api/v1/reservations/${detail.id}/cancel`)
      .send({ reason: 'Pengujian kebijakan pembatalan' });
    expect(repeat.status).toBe(409);

    const exceptions = await prisma.reservationException.findMany({
      where: { dedupeKey: { contains: denyCancel.code } },
    });
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]).toMatchObject({
      exceptionType: 'POLICY_VIOLATION',
      dormitoryId: dormitory!.dormitoryId,
    });
    expect(exceptions[0]!.occurrenceCount).toBeGreaterThanOrEqual(2);

    await deactivate(admin.agent, denyCancel.id);
    const cancelled = await manager.agent
      .post(`/api/v1/reservations/${detail.id}/cancel`)
      .send({ reason: 'Kebijakan dinonaktifkan' });
    expect(cancelled.status, cancelled.text).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });

  it('blocks check-in when a CHECK_IN policy denies it', async () => {
    const frontDesk = await loginAs(DEMO_ACCOUNTS.frontdesk);
    const checkIn = isoDate(0);
    const checkOut = isoDate(1);
    const available = await availability(manager.agent, checkIn, checkOut);
    const dormitory = available.dormitories.find(
      (item) => item.dormitoryCode === 'DEMO-DORM-01' && item.availableBeds > 0,
    );
    expect(dormitory).toBeTruthy();
    const bed = dormitory!.beds[0]!;

    await prisma.bed.update({
      where: { id: bed.id },
      data: { housekeepingStatus: 'READY', status: 'ACTIVE' },
    });
    await prisma.room.update({
      where: { id: bed.roomId },
      data: { housekeepingStatus: 'READY', operationalStatus: 'ACTIVE' },
    });

    const created = await manager.agent.post('/api/v1/reservations').send({
      dormitoryId: dormitory!.dormitoryId,
      employeeIds: [employeeId],
      checkInDate: checkIn,
      checkOutDate: checkOut,
      occupantCount: 1,
      bedIds: [bed.id],
      autoConfirm: true,
      idempotencyKey: `policy-checkin-${Date.now()}`,
    });
    expect(created.status, created.text).toBe(201);
    const detail = created.body.data as ReservationDetail;
    createdReservationIds.push(detail.id);
    expect(detail.status).toBe('CONFIRMED');

    const denyCheckIn = await createPolicy(admin.agent, {
      category: 'CHECK_IN_RULES',
      effect: 'DENY',
      parameters: {},
    });
    await approveAndActivate(admin.agent, denyCheckIn.id);

    const blocked = await frontDesk.agent.post('/api/v1/stays/check-in').send({
      reservationId: detail.id,
      employeeId,
    });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('POLICY_DENIED');

    const exception = await prisma.reservationException.findFirst({
      where: { dedupeKey: { contains: denyCheckIn.code } },
    });
    expect(exception).toMatchObject({
      exceptionType: 'POLICY_VIOLATION',
      reservationId: detail.id,
    });

    await deactivate(admin.agent, denyCheckIn.id);
    const allowed = await frontDesk.agent.post('/api/v1/stays/check-in').send({
      reservationId: detail.id,
      employeeId,
    });
    expect(allowed.status, allowed.text).toBe(200);
    expect(allowed.body.data.status).toBe('CHECKED_IN');
  });
});
