import { Router } from 'express';
import { z } from 'zod';
import {
  policyActivationSchema,
  policyApprovalSchema,
  policyCreateSchema,
  policyEvaluationListQuerySchema,
  policyListQuerySchema,
  policySimulationSchema,
  policyUpdateSchema,
  type PolicyEvaluationLogResult,
  type PolicyListResult,
} from '@whoosh/shared';
import { paginationMeta, requestId, sendSuccess } from '../../lib/http.js';
import { validate } from '../../lib/validate.js';
import { requirePermission } from '../auth/middleware.js';
import {
  activateEnginePolicy,
  approveEnginePolicy,
  createEnginePolicy,
  deactivateEnginePolicy,
  deleteEnginePolicy,
  getEnginePolicy,
  getPolicyDashboard,
  listEnginePolicies,
  listPolicyEvaluations,
  listPolicyVersions,
  simulatePolicies,
  updateEnginePolicy,
} from './service.js';

export const policyEngineRouter = Router();

function actorMeta(req: { auth?: { user: { id: string } }; ip?: string; get: (name: string) => string | undefined }) {
  return {
    userId: req.auth!.user.id,
    ipAddress: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null,
  };
}

policyEngineRouter.get(
  '/summary',
  requirePermission('policies.read'),
  async (req, res) => {
    sendSuccess(res, await getPolicyDashboard(req.access!));
  },
);

policyEngineRouter.get(
  '/policies',
  requirePermission('policies.read'),
  async (req, res) => {
    const query = validate(policyListQuerySchema, req.query);
    const result = await listEnginePolicies(req.access!, query);
    const pagination = paginationMeta(result.total, query.page, query.pageSize);
    sendSuccess(
      res,
      { items: result.items, counts: result.counts, pagination } satisfies PolicyListResult,
      { pagination },
    );
  },
);

policyEngineRouter.post(
  '/policies',
  requirePermission('policies.create'),
  async (req, res) => {
    const input = validate(policyCreateSchema, req.body);
    const policy = await createEnginePolicy(input, actorMeta(req), req.access!);
    sendSuccess(res, policy, { status: 201 });
  },
);

policyEngineRouter.get(
  '/policies/:id',
  requirePermission('policies.read'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    sendSuccess(res, await getEnginePolicy(id, req.access!));
  },
);

policyEngineRouter.patch(
  '/policies/:id',
  requirePermission('policies.update'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(policyUpdateSchema, req.body);
    sendSuccess(res, await updateEnginePolicy(id, input, actorMeta(req), req.access!));
  },
);

policyEngineRouter.get(
  '/policies/:id/versions',
  requirePermission('policies.read'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    sendSuccess(res, await listPolicyVersions(id, req.access!));
  },
);

policyEngineRouter.post(
  '/policies/:id/approve',
  requirePermission('policies.manage'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(policyApprovalSchema, req.body);
    sendSuccess(res, await approveEnginePolicy(id, input, actorMeta(req), req.access!));
  },
);

policyEngineRouter.post(
  '/policies/:id/activate',
  requirePermission('policies.activate'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(policyActivationSchema, req.body);
    sendSuccess(res, await activateEnginePolicy(id, input, actorMeta(req), req.access!));
  },
);

policyEngineRouter.post(
  '/policies/:id/deactivate',
  requirePermission('policies.activate'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    const input = validate(policyActivationSchema, req.body);
    sendSuccess(res, await deactivateEnginePolicy(id, input, actorMeta(req), req.access!));
  },
);

policyEngineRouter.delete(
  '/policies/:id',
  requirePermission('policies.manage'),
  async (req, res) => {
    const id = validate(z.uuid(), req.params.id);
    await deleteEnginePolicy(id, actorMeta(req), req.access!);
    sendSuccess(res, { deleted: true });
  },
);

policyEngineRouter.post(
  '/evaluate',
  requirePermission('policies.evaluate'),
  async (req, res) => {
    const input = validate(policySimulationSchema, req.body);
    const result = await simulatePolicies(input, actorMeta(req), req.access!, requestId());
    sendSuccess(res, result);
  },
);

policyEngineRouter.get(
  '/evaluations',
  requirePermission('policies.read'),
  async (req, res) => {
    const query = validate(policyEvaluationListQuerySchema, req.query);
    const result = await listPolicyEvaluations(req.access!, query);
    sendSuccess(res, result satisfies PolicyEvaluationLogResult, {
      pagination: result.pagination,
    });
  },
);
