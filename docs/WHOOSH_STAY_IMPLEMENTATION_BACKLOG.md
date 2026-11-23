# WHOOSH STAY — Implementation Backlog

Date: 2026-11-23. Derived from `docs/WHOOSH_STAY_FEATURE_GAP_ANALYSIS.md`.
Rule: every item ships backend + UI + tests in one slice; no frontend-only pages, no dead buttons.

## Legend

`[ ]` pending · `[~]` in progress · `[x]` completed · `[!]` blocked (reason required)

## Phase A — Occupancy Intelligence (priority 1)

- [x] A1 Baseline audit documents (this doc set)
- [x] A2 Shared schemas/types: `occupancyQuerySchema`, `occupancyTrendQuerySchema`, `occupancyForecastQuerySchema`, `BedOccupancyStatus`, `OccupancySummary`, `OccupancyTrendResult`, `OccupancyForecastResult`, `KpiDefinition`
- [x] A3 Additive permission `occupancy.read` (assigned to existing roles incl. DORMITORY_MANAGER/ADMIN/FRONT_DESK, SUPER_ADMIN, ADMINISTRATOR; not HOUSEKEEPING unless review says otherwise)
- [x] A4 API: `GET /api/v1/occupancy/summary` (date, dormitoryId, buildingId, floorId, roomId; scope-aware; forbids selfOnly; status breakdown; per-dormitory table; KPI defs)
- [x] A5 API: `GET /api/v1/occupancy/trend` (from/to, max 92 days, daily totals by status)
- [x] A6 API: `GET /api/v1/occupancy/forecast` (confirmed-only vs roster-included basis; optimistic/pessimistic envelope only with data; `INSUFFICIENT_DATA` path)
- [x] A7 Unify capacity predicate across dashboard, calendar, reports, availability (one helper, exported)
- [x] A8 Web page `/manage/occupancy` — filters, KPI cards, status distribution, dormitory table, trend bars, forecast panel with basis + confidence + data-quality warnings; loading/empty/error/forbidden states
- [x] A9 Sidebar item «Inteligensi Hunian» in Reservasi group (`occupancy.read`); no duplicate menu entries
- [x] A10 Tests: unit (status precedence, capacity predicate), integration (scope isolation, forbidden scope, consistency dashboard vs occupancy, trend window guard, insufficient-data forecast), Playwright (route reachable, heading, RBAC absence for housekeeping)
- [x] A11 Docs: update `docs/CHANGELOG.md`, `docs/IMPLEMENTATION_PROGRESS.md`

## Phase B — Reservation Exception Center (priority 7)

- [x] B1 Schema: `reservation_exceptions` (type, severity, status, reservation/alloc, owner, evidence, resolution) additive raw SQL
- [x] B2 Permissions: `exceptions.read`, `exceptions.manage`
- [x] B3 API expose 409 conflict cases (allocation conflict, overbooking, readiness failure) as exception cases; list/detail/assign/resolve endpoints
- [x] B4 Web queue + detail drawer with actions
- [x] B5 Tests: state machine, scope isolation, conflict generation

## Phase C — Policy Engine (priority 8)

- [ ] C1 Schema: `accommodation_policy_versions`, `policy_evaluations`
- [ ] C2 API: create version, activate (effective date + priority), conflict detection, dry-run evaluate, evaluation log list
- [ ] C3 Web policy versions tab + evaluation results
- [ ] C4 Tests: precedence resolution, conflict detection, immutable historical evaluations

## Phase D — Housekeeping Intelligence (priority 6)

- [ ] D1 HK SLA settings keys (additive `SETTING_KEYS`: `housekeeping.slaMinutes.perPriority`, `housekeeping.autoAssign`) — defaults configurable, no invented SLA sold as policy
- [ ] D2 Task timestamps: assigned/started/verified/rejected; breach computation; verify/reject flow additions
- [ ] D3 API: queue with priority + breach, SLA summary
- [ ] D4 Web: queue columns (priority, SLA countdown, breach), verify/reject UI
- [ ] D5 Tests: SLA math, transitions, scope

## Phase E — Facility & Asset Intelligence (priority 5)

- [ ] E1 Schema: `assets`, `asset_events`, `asset_inspections`; link to rooms, maintenance tickets
- [ ] E2 Permissions: `assets.read`, `assets.manage`
- [ ] E3 API CRUD + QR token + lifecycle transitions + cost ledger
- [ ] E4 Web asset registry, detail with timeline, QR print
- [ ] E5 Tests

## Phase F — BI (priority 3)

- [ ] F1 KPI catalogue (shared constants with formulas) — includes occupancy KPIs from Phase A
- [ ] F2 API `/analytics` aggregations (dorm/building/floor, monthly trends, export)
- [ ] F3 Web analytics page
- [ ] F4 Tests

## Phase G — Floor Plan (priority 2)

- [ ] G1 Schema: `floor_plans` config (grid cells per room/bed), status overlay read model
- [ ] G2 API GET floor plan with live statuses
- [ ] G3 Web interactive plan (keyboard accessible list fallback)
- [ ] G4 Tests
- Note: layout geometry must be authored by admins through UI; do not fabricate an official KCIC building layout.

## Phase H — AI Assistant (priority 4)

- [ ] H1 Provider abstraction (`AI_PROVIDER` unset = disabled); no network calls by default
- [ ] H2 Read-only tools: occupancy summary, availability, reservation lookup — RBAC-scoped server side
- [ ] H3 Interaction log table
- [ ] H4 Web panel with explicit "AI disabled / not configured" state
- [!] H5 BLOCKED: real provider contract/credentials + data-governance approval. Ship UI/API disabled state only.

## Phase I — Notifications & reports extensions

- [ ] I1 New notification events: exception assigned, SLA breach, policy version activated
- [ ] I2 Scheduled reports — BLOCKED: no scheduler; requires infra decision
- [ ] I3 PDF export — requires renderer decision

## Phase J — Hardening

- [ ] J1 OpenAPI coverage for new routes
- [ ] J2 Responsive + a11y checks for new screens
- [ ] J3 Full regression: unit, integration, E2E

## Ordering rationale

A first because it fixes an existing correctness defect (three capacity formulas) and supplies KPIs the later phases need. Then B/C (workflow correctness), D/E (operations depth), F/G (insight + space), H last and disabled until data governance allows it.
