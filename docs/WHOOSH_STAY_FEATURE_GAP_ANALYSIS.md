# WHOOSH STAY — Feature Gap Analysis

Date: 2026-11-23. Baseline: see `docs/WHOOSH_STAY_BASELINE_AUDIT.md`.
Gap status values: `GAP` (missing), `PARTIAL` (exists, insufficient), `OK` (meets target), `BLOCKED` (needs decision/config/data).

## 1. Priority map (master prompt)

| # | Priority | Current state | Gap |
|---|---|---|---|
| 1 | Smart Occupancy Intelligence | PARTIAL | 3 inconsistent capacity formulas; no bed-status model; no history/snapshots; no forecast; no data-quality signalling |
| 2 | Digital Dormitory Floor Plan | GAP | tree/list masters only; no spatial layout, no room/bed map, no status overlay |
| 3 | Accommodation BI | PARTIAL | per-dorm as-of report + 7-day arrival bars; no KPI catalogue, no trend/aggregates, no PDF, no scheduled reports |
| 4 | AI Accommodation Assistant | GAP | nothing |
| 5 | Facility & Asset Intelligence | PARTIAL | `Facility`/`RoomFacility` + maintenance tickets; no asset registry, serial/QR, condition, lifecycle, cost |
| 6 | Housekeeping Intelligence | PARTIAL | queue + checklist + verify; no SLA config, no breach tracking, no priority engine, no rejection flow |
| 7 | Reservation Exception Center | PARTIAL | 409 conflicts + generic `IntegrationException`; no case workflow, severity, ownership, resolution trail |
| 8 | Accommodation Policy Engine | PARTIAL | `AccommodationPolicy` rows for roster; no versions, effective dates, priority, conflict detection, evaluation log |

## 2. Cross-cutting gaps

| Area | Gap |
|---|---|
| Data model | occupancy snapshots, forecasts, assets, exception cases, policy versions/evaluations, KPI defs, AI logs, HK SLA config, floor-plan config |
| API | no `/occupancy/*`, `/assets/*`, `/exceptions/*`, `/policies` versioning endpoints, `/analytics/*`, `/ai/*` |
| Permissions | need additive codes: `occupancy.read`, `assets.*`, `exceptions.*`, `analytics.read`, `ai.use` (RBAC mapping additive only) |
| Frontend | new management routes; nav additions inside existing groups only (no duplicate menus) |
| Testing | new unit/integration/E2E; existing suites must stay green |
| Observability | occupancy/forecast data-quality reporting; audit events for new modules |

## 3. Priority-1 detailed gap (the first implementation slice)

### 3.1 Capacity definition inconsistency

| Surface | Current predicate | File |
|---|---|---|
| Dashboard occupancy | bed ACTIVE + room ACTIVE + scope | `apps/api/src/modules/dashboard/routes.ts` |
| Calendar | all beds under ACTIVE dormitory, no room/building filter | `apps/api/src/modules/calendar/routes.ts` |
| Report | bed ACTIVE + room ACTIVE + scope | `apps/api/src/modules/reports/routes.ts` |
| Availability summary | walks tree, counts beds without room filter | `apps/api/src/modules/availability/service.ts` |

**Target:** one exported predicate (active dormitory → active building → active room → active bed) used by all occupancy surfaces. Non-capacity beds excluded from totals and reported as `excludedBeds` where relevant.

### 3.2 Bed status model

Missing. Target derivation per (bed, date):

1. `BLOCKED` — bed/room not ACTIVE, or room `BLOCKED`, or bed outside active dormitory/building.
2. `MAINTENANCE` — room `MAINTENANCE`, or `InventoryBlock` (MAINTENANCE/EQUIPMENT) overlapping the day.
3. `OCCUPIED` — `ACTIVE` allocation covering the day.
4. `RESERVED` — `HELD` allocation covering the day.
5. `CLEANING` — `housekeepingStatus` in DIRTY/CLEANING/INSPECTION_REQUIRED, or open housekeeping task on the bed.
6. `AVAILABLE` — otherwise.

Contract: statuses computed from existing tables; no new status column required for the read model.

### 3.3 History & forecast

- No snapshot table, no trend beyond 7 days, no forecast.
- **Target (this slice):** compute on demand from allocations + inventory blocks + housekeeping (no backfill of fabricated history). Trend endpoint limited to a bounded range. Forecast = confirmed HELD/ACTIVE allocations + rosters where data exists; otherwise `INSUFFICIENT_DATA` with null projections and an explicit data-quality note.

### 3.4 Honesty rules

- Never invent history: derived only from recorded allocations/blocks/tasks.
- Never invent forecasts: no statistical model when data is insufficient; label basis (`CONFIRMED_ONLY`, `ROSTER_INCLUDED`) and confidence.
- Formula definitions exposed in the payload so BI and UI share the same numbers.

## 4. Later-phase gaps (backlog summary)

| Phase | Scope | Blockers |
|---|---|---|
| Floor plan | layout config, room/bed overlay with live status, QR | needs approval on building geometry data (no official layout exists) |
| BI | KPI catalogue, dorm/building/floor aggregation, monthly/quarterly trends, PDF | PDF renderer choice; no official KPI targets |
| AI | provider abstraction, read-only tool calls, RBAC scoped, logs | provider credentials/contract BLOCKED; must remain disabled without config |
| Assets | registry, QR, condition, lifecycle, maintenance linkage, cost | asset taxonomy needs business input; costs cannot be seeded as real |
| Housekeeping | SLA config, breach list, priority, rejection | SLA targets need policy decision (no invented SLA) |
| Exceptions | case queue, severity, ownership, resolution, evidence | none blocking for MVP workflow |
| Policy engine | versions, effective dates, priority, conflicts, dry-run, evaluation log | none blocking; approval modes still need business confirmation |

## 5. Additive-only commitments

- No existing permission removed or renamed; new codes appended.
- No existing API removed; new endpoints under `/api/v1`.
- No DB reset; new tables via additive raw SQL migration.
- No sidebar item duplicated; new items land in existing groups.
