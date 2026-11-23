# WHOOSH STAY — Implementation Progress

Persistent progress log for the enterprise accommodation programme. Update this file after every slice; resume from the first non-`COMPLETED` phase.

Last updated: 2026-11-23

## Status vocabulary

`COMPLETED` (implemented + tested) · `PARTIAL` · `BLOCKED` (reason) · `NOT STARTED`

## Programme phases

| Phase | Status | Notes |
|---|---|---|
| 0. Audit & design docs | COMPLETED | baseline audit, gap analysis, backlog, architecture update |
| A. Occupancy Intelligence | COMPLETED | canonical capacity, status model, summary/trend/forecast API, `/manage/occupancy`, tests |
| B. Reservation Exception Center | COMPLETED | additive `reservation_exceptions`, `exceptions.read/manage`, generation from 409 paths, queue/detail UI, tests |
| C. Accommodation Policy Engine | COMPLETED | additive `accommodation_policies`/`policy_versions`/`policy_evaluations`, 16 categories, deterministic precedence engine, workflow enforcement in reservation/check-in/cancellation, `/manage/policies`, tests |
| D. Housekeeping Intelligence | NOT STARTED | |
| E. Asset Intelligence | NOT STARTED | |
| F. BI / Analytics | NOT STARTED | |
| G. Floor Plan | NOT STARTED | geometry must be authored, not invented |
| H. AI Assistant | BLOCKED | provider contract + data governance; disabled state only can ship |
| I. Notifications/report extensions | NOT STARTED | scheduled reports + PDF blocked on infra decision |
| J. Hardening/regression | NOT STARTED | |

## Phase A checklist (Task #111–#115)

- [x] A0 Audit docs written
- [x] A1 Shared occupancy schemas/types + KPI definitions in `packages/shared`
- [x] A2 Additive `occupancy.read` permission + role bundles
- [x] A3 API module `occupancy`: capacity predicate, status classifier, summary/trend/forecast routes
- [x] A4 Unify capacity across dashboard/calendar/reports/availability
- [x] A5 Web page `/manage/occupancy` + sidebar entry + route
- [x] A6 Unit + integration tests
- [x] A7 Playwright route/RBAC coverage
- [x] A8 Full verification (typecheck, lint, unit, integration, targeted E2E, axe, responsive audit, build)
- [x] A9 Changelog + progress update

## Phase B checklist (Task #116–#120)

- [x] B1 Additive `reservation_exceptions` model + raw-SQL migration (dedupe key, evidence JSON, assignee/resolver, occurrence counter)
- [x] B2 Additive permissions `exceptions.read` / `exceptions.manage` with role bundles
- [x] B3 Exception service + routes: conflict generation from reservation/check-in 409 paths; list (filters/counts/pagination), detail, assign, resolve
- [x] B4 Web `/manage/exceptions` queue with KPI cards, filters, table and detail drawer limited by permission
- [x] B5 Unit + integration tests: dedupe keys, schema constraints, generation (allocation/overbooking/readiness/missing allocation), scope isolation, state machine
- [x] B6 Playwright route/RBAC coverage + axe + responsive audit
- [x] B7 Changelog + progress update

## Phase C checklist (Task #121–#126)

- [x] C1 Shared contracts: 16 categories, effects, severities, workflows, decision results, parameter metadata and validation, simulation/list query schemas, version/evaluation DTOs (`packages/shared/src/policies.ts`)
- [x] C2 Additive schema + migrations: extend `accommodation_policies` with engine columns (`engine_managed` default false keeps legacy rows out), new `accommodation_policy_versions` + `policy_evaluations`, reservation emergency/priority columns (`20261123170000_policy_engine`, `20261123180000_reservation_policy_context`); nothing dropped or renamed
- [x] C3 Additive permissions `policies.read/create/update/activate/manage/evaluate` with role bundles (registry 71 codes, `rolePermissions=240`); dev synced with `SEED_DEMO=false db:seed` (users/data untouched)
- [x] C4 Deterministic evaluation engine: category evaluators, date/dormitory/condition scoping, workflow scoping, precedence `DENIED > REQUIRES_MANUAL_REVIEW > REQUIRES_APPROVAL > ALLOWED`, priority/code tie-break
- [x] C5 Registry service + routes: CRUD, optimistic `expectedVersion`, version history, approval, activation/deactivation, summary, simulation, evaluation log with filters
- [x] C6 Workflow integration: reservation create (auto/manual, emergency, priority), cancellation, check-in; policy violations recorded in Exception Center with stable dedupe keys (in-transaction where the subject row is uncommitted)
- [x] C7 Management UI `/manage/policies`: registry with KPI cards and filters, editor, detail with version history and approve/activate/deactivate/delete, simulation, evaluation logs; permission-gated actions
- [x] C8 Tests: engine unit suite (precedence, dates, scoping, 16 categories, violation keys), API integration suite (lifecycle, approval gating, RBAC matrix, simulation, effective dates, reservation/cancellation/check-in enforcement with exception dedupe)
- [x] C9 E2E: full UI lifecycle (create → approve → activate → deactivate → delete), live simulation + evaluation log, crew denial; `/manage/policies` added to axe route list
- [x] C10 Full verification + changelog/progress update

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-11-23 | Baseline typecheck/lint/build | pass |
| 2026-11-23 | Baseline unit | 53/53 |
| 2026-11-23 | Baseline integration | 122/122 |
| 2026-11-23 | Baseline E2E | 91/91 |
| 2026-11-23 | Baseline dev crawl (50 views) | pass, expected /auth/me 401 only |
| 2026-11-23 | Phase A typecheck / lint / build | pass |
| 2026-11-23 | Phase A unit | 57/57 (8 files) |
| 2026-11-23 | Phase A integration | 128/128 (22 files) |
| 2026-11-23 | Phase A targeted E2E (`management`, `sidebar-navigation`) | 13/13 pass |
| 2026-11-23 | Phase A axe a11y (`a11y.spec.ts`) | 4/4 pass (first run found 1 scrollable-region finding on `/manage/occupancy`; fixed in shared `DataTable`, re-run green) |
| 2026-11-23 | Phase A responsive management audit | all 17 widths 320–2880 pass (5 mobile widths initially overflowed; fixed with `min-w-0`, re-run green) |
| 2026-11-23 | Dev DB additive permission sync | `SEED_DEMO=false db:seed` → permissions=64, rolePermissions=219, users/data untouched |
| 2026-11-23 | Phase B schema/migration | `20261123120000_reservation_exceptions` applied to dev, test and E2E databases (additive only) |
| 2026-11-23 | Phase B dev RBAC sync | `SEED_DEMO=false db:seed` → permissions=66, roles=8, rolePermissions=228, users=0 touched, demo=false |
| 2026-11-23 | Phase B typecheck / lint / build | pass (root typecheck, eslint 0 warnings, production build exit 0) |
| 2026-11-23 | Phase B unit | 63/63 (9 files, incl. 6 exception dedupe/schema tests) |
| 2026-11-23 | Phase B integration | 134/134 (23 files, incl. 6 exception tests); targeted `exceptions.test.ts` 6/6 |
| 2026-11-23 | Phase B targeted E2E (`management`, `sidebar-navigation`) | 13/13 pass |
| 2026-11-23 | Phase B axe a11y (`a11y.spec.ts`) | 4/4 pass including `/manage/exceptions` |
| 2026-11-23 | Phase B responsive audit (`responsive-audit.spec.ts`) | 34/34 pass (crew + management at all 17 widths 320–2880, `/manage/exceptions` included) |
| 2026-11-23 | Phase C schema/migration | `20261123170000_policy_engine` + `20261123180000_reservation_policy_context` applied to dev, test and E2E databases (additive only) |
| 2026-11-23 | Phase C dev RBAC sync | `SEED_DEMO=false db:seed` → permissions=71, roles=8, rolePermissions=240, users=0 touched, demo=false |
| 2026-11-23 | Phase C typecheck / lint / build | pass (API + web typecheck, eslint clean, production web build exit 0; `ManagementPoliciesPage` chunk 33.93 kB) |
| 2026-11-23 | Phase C unit | 88/88 (10 files, incl. `engine.test.ts` precedence, effective dates, scoping, 16 category evaluators, violation keys) |
| 2026-11-23 | Phase C integration | 143/143 (24 files, incl. `policies.test.ts` lifecycle, approval gating, RBAC matrix, simulation, effective dates, reservation/cancellation/check-in enforcement, exception dedupe) |
| 2026-11-23 | Phase C targeted E2E (`policies.spec.ts`) | 3/3 pass (UI lifecycle, live simulation + evaluation log, crew denial) |
| 2026-11-23 | Phase C axe a11y (`a11y.spec.ts`) | 4/4 pass; management scan now 20 routes including `/manage/policies` |
| 2026-11-23 | Phase C route reachability (`sidebar-navigation.spec.ts`) | pass, `/manage/policies` reachable from «Pengelolaan Sistem» |

## Decisions

- Capacity = BED ACTIVE in ROOM ACTIVE in BUILDING ACTIVE in DORMITORY ACTIVE, within `AccessScope`. Calendar will show fewer beds than before where inactive rooms previously counted — intended correction.
- Occupancy rate = occupied / capacity, `null` when capacity = 0.
- Forecast basis must be declared; insufficient data returns nulls, never synthetic values.
- New nav item only inside existing `Reservasi` group; sidebar background stays `#8B1A1A`.
- Forecast basis is either `CONFIRMED_ONLY` or `ROSTER_INCLUDED` (only when the scope supports roster recommendations); roster signals are recommendations without a linked reservation. No statistical model is implied.
- `occupancy.read` is additive and not granted to CREW, HOUSEKEEPING or MAINTENANCE; `selfOnly` principals receive 403.
- Shared `DataTable` scroll regions are keyboard-focusable (`tabIndex=0`, `role=region`) so wide tables can be scrolled without a mouse.

### Phase B decisions

- Exceptions are additive operational records: nothing in the reservation, allocation or stay flows is blocked by exception recording. `safeRecordReservationException` logs a warning and swallows recorder failures so the original 409 response is never masked.
- Dedupe keys: `ALLOCATION_CONFLICT` hashes the sorted requested bed-id set (SHA-256, 20 chars) to stay within `VarChar(200)`; `OVERBOOKING` uses dormitory + dates + occupant count; readiness/missing-allocation use the reservation (and bed) id. Recurrence increments `occurrenceCount` and refreshes `lastDetectedAt`.
- A re-detected closed exception reopens as `OPEN` and clears assignee, acknowledgement and resolution fields so the queue reflects the current failure.
- Status machine: `OPEN → ACKNOWLEDGED` on assign, unassign returns to `OPEN`, `OPEN/ACKNOWLEDGED → RESOLVED|DISMISSED` on resolve with a mandatory note; every other transition returns `409 EXCEPTION_STATE_INVALID`. Assign/resolve are audited (`EXCEPTION_ASSIGN`, `EXCEPTION_RESOLVE`, `EXCEPTION_DISMISS`).
- Scope: list filters by accessible dormitories (dormitory ids + dormitories of building-scoped grants); out-of-scope detail returns `404` to avoid existence leaks; `SELF` principals receive `403`. `exceptions.manage` is held by SYSTEM_ADMIN, DORMITORY_MANAGER, DORMITORY_ADMIN and FRONT_DESK; AUDITOR is read-only.

### Phase C decisions

- Policy values are configuration, not official KCIC policy: every parameter is admin-authored, the editor labels example values as illustrations, and no approved KCIC thresholds were invented. No policy is seeded, so every workflow stays `ALLOWED` until an operator creates, approves and activates one.
- Lifecycle: `create` → DRAFT v1 unapproved; any edit creates version n+1 (optimistic `expectedVersion`, stale write → `409 POLICY_VERSION_CONFLICT`), resets approval and returns the policy to DRAFT/inactive. Activation requires an approved version, matching `expectedVersion`, and a non-expired `effectiveFrom`/`effectiveTo`; ACTIVE policies cannot be deleted (`409 POLICY_STATE_INVALID`) and must be deactivated first. Approval is a separate `policies.manage` action with a note (≥3 chars) and is audited.
- Deterministic aggregation: worst effect wins regardless of priority (`DENIED > REQUIRES_MANUAL_REVIEW > REQUIRES_APPROVAL > ALLOWED`); ties break by priority desc then policy code asc. Effective dates are inclusive; dormitory scoping hides a policy from other dormitories; conditions must match exactly.
- Workflow scoping (`CATEGORY_WORKFLOWS`) keeps unrelated flows unaffected (e.g. a CANCELLATION policy is never evaluated on reservation create). `EMERGENCY_RESERVATION` only applies when `isEmergency` is true; `ROSTER_DEPENDENCY` only when the workflow supplies the roster signal.
- Enforcement returns the shared decision envelope (decision, blocking policy id/code/version, reason, conditions, evaluatedAt) and writes one `policy_evaluations` row per evaluation. Violations use `buildPolicyViolationKey` (`POLICY_VIOLATION:code:workflow:dormitory:subject-or-dates`, ≤200 chars) with upsert so recurring denials increment `occurrenceCount` instead of duplicating Exception Center rows.
- Transactions: on reservation create the violation is recorded inside the same transaction as the reservation (`exceptionTx`), so an FK-safe record commits with approval/manual-review outcomes and rolls back with a DENY (the evaluation log row remains the audit trail). Recording failures are logged and never mask the original 409.
- RBAC: SYSTEM_ADMIN holds all six `policies.*` codes; DORMITORY_MANAGER/ADMIN and FRONT_DESK may read and simulate (`policies.read/evaluate`); AUDITOR is read-only; CREW has no access. The registry is enforced server-side; the UI only hides actions as a convenience.

## Deferred defects (pre-existing, out of scope unless touched)

Gender-policy enforcement, overlapping personal reservations, Telegram binding verification, session cap, OpenAPI coverage, E2E fixture reset, frontend unit tests, 44px targets on legacy controls, raw enum copy, dependency advisories requiring breaking downgrades. Policy Engine specifics: the editor surfaces the API's generic "Request validation failed" instead of the field-level reason for invalid parameters (server still rejects correctly); evaluation happens on workflow actions only — no scheduled re-evaluation; emergency/priority context is staff-declared on the reservation, not verified against an external source.
