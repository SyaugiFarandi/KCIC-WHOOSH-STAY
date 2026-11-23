# WHOOSH STAY — Architecture Update (Enterprise Accommodation Intelligence)

Date: 2026-11-23. This document records the target architecture for the enterprise expansion and how it extends — not replaces — the existing design.

## 1. Invariants

- Existing monorepo and stack unchanged (Express 5 + Prisma 6 + Postgres 16; React 19 + Vite + Tailwind v4 + TanStack Query).
- Existing routes, RBAC and design system preserved; new capability is additive.
- Authorization remains server-side (`requirePermission` + `AccessScope` helpers). Frontend never filters for security.
- No destructive migrations; additive raw SQL only; no demo data in production.
- Truthful analytics: analytics only from recorded data.

## 2. Target module map

```
apps/api/src/modules/
  occupancy/          # Phase A  read model: capacity, statuses, trend, forecast
  analytics/          # later KPI aggregation API
  assets/             # later asset registry
  exceptions/         # Phase B  reservation exception queue
  policies/           # Phase C  policy versioning + evaluation engine/log
  ai/                 # later provider abstraction (disabled by default)
apps/web/src/pages/
  ManagementOccupancyPage.tsx   # Phase A
  ManagementAnalyticsPage.tsx   # later
  ManagementAssetsPage.tsx      # later
  ManagementExceptionsPage.tsx  # Phase B
  ManagementPoliciesPage.tsx    # Phase C
packages/shared/src/
  occupancy.ts        # Phase A schemas + types + KPI definitions
  policies.ts         # Phase C categories, schemas, decision types
  permissions.ts      # additive codes
```

## 3. Occupancy Intelligence design (first slice)

### 3.1 Capacity predicate (single source of truth)

`apps/api/src/modules/occupancy/capacity.ts` exports:

- `capacityRoomWhere(access, filter)` → room predicate: `operationalStatus: 'ACTIVE'`, `building.status: 'ACTIVE'`, `building.dormitory.status: 'ACTIVE'`, AND `readableRoomWhere(access)`, plus optional `dormitoryId/buildingId/floorId/roomId`.
- `capacityBedsWhere(...)` → `Bed { status: 'ACTIVE', room: capacityRoomWhere }`.
- `countCapacityBeds(tx, access, filter)`.

Dashboard, calendar, reports and availability-summary switch to this helper. **Behaviour change is intentional and documented:** calendar totals may decrease where a room/building is inactive; that is the correct fix, not a regression.

### 3.2 Status derivation

`apps/api/src/modules/occupancy/status.ts` implements `classifyBed(input, day)` with precedence:

`BLOCKED > MAINTENANCE > OCCUPIED > RESERVED > CLEANING > AVAILABLE`

Inputs per bed: room/dormitory/building status, `InventoryBlock` overlap for the day, allocations (HELD/ACTIVE) overlap (`stayStart < dayEnd && stayEnd > dayStart`), `housekeepingStatus`, open housekeeping task.

Reuse the repository's exclusive-end day semantics (`parseDateOnly`, UTC midnight) and the existing allocation overlap predicate. No new status columns.

### 3.3 API surface

| Endpoint | Permission | Notes |
|---|---|---|
| `GET /api/v1/occupancy/summary` | `occupancy.read` | `date`, `dormitoryId?`, `buildingId?`, `floorId?`, `roomId?`; returns totals, status breakdown, per-dormitory rows, formula definitions, `excludedBeds` |
| `GET /api/v1/occupancy/trend` | `occupancy.read` | `from`, `to` (≤ 92 days), optional filters; daily totals + per-status counts |
| `GET /api/v1/occupancy/forecast` | `occupancy.read` | `from`, `to`; `basis: CONFIRMED_ONLY | ROSTER_INCLUDED`; `INSUFFICIENT_DATA` + null projections when no usable signal; confidence + data-quality notes |

All endpoints forbid `selfOnly` scopes (403), apply `AccessScope`, use `sendSuccess` envelope, Zod validation, and record no fabricated values.

### 3.4 Payload contract (summary)

```ts
{
  asOf: '2026-11-23',
  scope: { level: 'global' | 'dormitory' | 'building', ... },
  totals: { capacity, available, reserved, occupied, cleaning, maintenance, blocked, excluded },
  occupancyRate: number | null,          // occupied / capacity; null when capacity=0
  statusBreakdown: [{ status, beds, pct }],
  dormitories: [{ id, name, capacity, occupied, available, occupancyRate }],
  formulas: [{ key, label, expression }],
  generatedAt: string
}
```

`occupancyRate` is a rate on *capacity* only when `capacity > 0`; otherwise `null` (never `0` pretending to be a real rate). A secondary `utilizationRate` may be exposed as occupied / (capacity − blocked − maintenance), also nullable.

### 3.5 Forecast honesty

- `CONFIRMED_ONLY`: HELD/ACTIVE allocations only.
- `ROSTER_INCLUDED`: adds `RosterAssignment` where present (documented as demand signal, not a reservation).
- No statistical model without history snapshots. Snapshot persistence is a later phase (needs a scheduler decision); until then trend is recomputed from transactional data, which is accurate but bounded by retention.
- Confidence = f(coverage of the horizon by confirmed data); low coverage yields `LOW` confidence with an explicit note.

## 4. Security model extension

- New permission codes appended to `packages/shared/src/permissions.ts`: `occupancy.read` (Phase A), `exceptions.read/manage` (Phase B), `policies.read/create/update/activate/manage/evaluate` (Phase C); later `assets.*`, `analytics.read`, `ai.use`.
- Role bundles updated additively (SUPER_ADMIN, ADMINISTRATOR, DORMITORY_MANAGER, DORMITORY_ADMIN, FRONT_DESK). HOUSEKEEPING untouched unless a documented need arises.
- Scope enforcement uses existing helpers; every new service takes `AccessScope`.
- Audit events for later write modules (exceptions, policies, assets) via existing audit log.

## 5. Frontend architecture

- New page under `ManagementLayout`, nav slot inside `Reservasi` group: «Inteligensi Hunian», `permission: 'occupancy.read'`. Phase C adds «Kebijakan Akomodasi» inside the existing `Pengelolaan Sistem` group (`policies.read`); no new group was created.
- Reuse `components/ui.tsx` primitives (`PageHeader`, `StatCard`, `Card`, `Badge`, `DistributionBar`, `DataTable`, `EmptyState`, `ErrorState`, `Skeleton`).
- TanStack Query keys namespaced `['occupancy', ...]`; filters synced with `useListParams`/URL.
- No chart library; Tailwind bars consistent with dashboard.
- States: loading skeleton, empty (no capacity), error with retry, forbidden (permission), plus data-quality banner for forecast.

## 6. Data & migration policy

| Phase | Schema change | Migration type |
|---|---|---|
| A | none (read model over existing tables) | none |
| B | `reservation_exceptions` | additive raw SQL |
| C | extend `accommodation_policies` (engine columns, legacy rows stay `engine_managed=false`), new `accommodation_policy_versions` + `policy_evaluations`, reservation `is_emergency`/`emergency_reason`/`priority` | additive raw SQL |
| D | HK task timestamp columns + settings keys | additive raw SQL |
| E | `assets`, `asset_events`, `asset_inspections` | additive raw SQL |
| F | none (queries over A–E) | none |
| G | `floor_plans` | additive raw SQL |

No column dropped, no table renamed, no seed data for production.

## 7. Testing strategy

- Unit: `classifyBed` precedence, capacity predicate truth table, KPI math (null invariants).
- Integration (Supertest, `whoosh_stay_test`): scope isolation (dormitory-scoped user cannot see another dorm's numbers), `selfOnly` → 403, dashboard/occupancy consistency, trend range guard, forecast insufficient-data path.
- E2E (isolated DB 4001/5175): route reachable from sidebar, heading assertion, RBAC absence for housekeeping, empty/full states.
- Regression gate: full unit + integration + targeted E2E + typecheck + lint + production build before marking a phase complete.

## 8. Known decisions still open (BLOCKED items)

1. Occupancy snapshot persistence + scheduler infra.
2. Official building floor-plan geometry — must be admin-authored, never invented.
3. AI provider + data-governance approval.
4. Housekeeping SLA targets (business decision).
5. KPI targets/benchmarks (business decision; formulas are implementation, targets are policy).
6. PDF renderer and scheduled-report infra.

## 9. Accommodation Policy Engine (Phase C, implemented)

### 9.1 Module layout

```
apps/api/src/modules/policies/
  engine.ts     # pure evaluation: CATEGORY_WORKFLOWS, evaluators, aggregate, violation key
  service.ts    # registry CRUD/versioning/approval/activation, evaluateAndEnforce, logs
  routes.ts     # /api/v1/policy-engine
apps/web/src/pages/ManagementPoliciesPage.tsx   # registry, simulation, logs
packages/shared/src/policies.ts                 # categories, effects, schemas, DTOs
```

The engine is pure (no I/O) and unit-tested independently; the service loads effective policies (`engine_managed = true`, non-deleted, `effectiveFrom <= asOf`, `effectiveTo` null or `>= asOf`, dormitory scope within `AccessScope`) and delegates to it. That split is what makes simulation, logs and workflow enforcement share one deterministic code path.

### 9.2 Decision contract

`aggregatePolicyDecision` returns `ALLOWED | REQUIRES_APPROVAL | REQUIRES_MANUAL_REVIEW | DENIED` with precedence `DENIED > REQUIRES_MANUAL_REVIEW > REQUIRES_APPROVAL > ALLOWED`; ties break by priority desc then policy code asc. Each evaluation line carries policy id, code, version, category, matched flag and reason. No policy active → `ALLOWED` and workflows proceed unchanged.

### 9.3 Workflow scoping

`CATEGORY_WORKFLOWS` limits each category to the workflows where its signal exists (e.g. `CANCELLATION → CANCELLATION`, `CHECK_IN_RULES/EARLY_CHECK_IN → CHECK_IN`, `OVERBOOKING_PREVENTION → RESERVATION_*`). `EMERGENCY_RESERVATION` requires `isEmergency=true`; `ROSTER_DEPENDENCY` requires the workflow to supply `hasRosterShift`. Missing signals mean "not evaluated", never a denial.

### 9.4 Lifecycle and versioning

`accommodation_policies` holds the current version snapshot; `accommodation_policy_versions` is the append-only history (one row per saved version, with `change_note`, `created_by`, `approved_at`). Updates use `updateMany` with `where { id, version: expectedVersion }`; a zero count means a concurrent edit won and returns `409 POLICY_VERSION_CONFLICT`. Approval and activation are distinct permissions (`policies.manage` / `policies.activate`); activation re-checks approval, `expectedVersion` and expiry. Legacy (non-engine) policy rows remain readable by their original module but are not evaluated.

### 9.5 Enforcement and audit

`evaluateAndEnforce` writes one `policy_evaluations` row per evaluation (`simulated` false/true, actor, request id, subject type/id), records a deduped `POLICY_VIOLATION` in the Exception Center (`buildPolicyViolationKey`, upsert on `dedupeKey`, `occurrenceCount += 1`, reopen closed rows) and either throws `409 POLICY_DENIED` (effect DENY) or hands the approval/manual-review outcome back to the workflow so it can persist the subject as `PENDING_APPROVAL`. Reservation create passes its `Prisma.TransactionClient` as `exceptionTx` so the violation visible in the same transaction; a DENY rolls both back, leaving the evaluation log as the audit record. Recording failures are logged and never replace the original response.

### 9.6 Honesty constraints

No policy rows are seeded. Parameters are admin-authored; the UI labels example values as illustrative and states that activation requires explicit approval. No KCIC threshold, dormitory rule or crew category was assumed in defaults.
