# WHOOSH STAY — Baseline Audit

Date: 2026-11-23
Repo: `KCIC-WHOOSH-STAY` (branch `main`, commit `2293a84` at audit start)
Method: code reading + existing automated suites + live dev crawl of all routes. No changes were made to the database during this audit.

## 1. Stack and layout

| Layer | Reality in repository |
|---|---|
| Monorepo | npm workspaces: `apps/api`, `apps/web`, `packages/shared` |
| API | Express 5, Prisma 6.19, PostgreSQL 16, Zod validation, Pino logging |
| Web | React 19, Vite 8, Tailwind CSS v4, TanStack Query 5, react-router-dom 7 |
| Auth | `mock` / `password` (async scrypt) / `oidc`; cookie sessions; per-account login throttle |
| RBAC | 63 permission codes, 8 roles, server-enforced scope (`global`, `dormitoryIds`, `buildingIds`, `selfOnly`, `assignedTaskOnly`) |
| Storage | S3-compatible MinIO (host ports 9110/9111 in dev); evidence and gallery buckets private |
| Notifications | In-app centre + email (SMTP) and Telegram providers, all inactive by default, truthful `MOCK_DELIVERED` |
| Jobs | No background scheduler; roster/employee sync is triggered by API calls |
| Deploy | Dockerfiles for API/web, nginx, compose (dev + prod template), GitHub Actions CI |

Modules registered in `apps/api/src/app.ts`: auth, health, users/admin, employees, master-data, inventory, availability, reservations, stays, housekeeping, maintenance, roster, calendar, dashboard, reports, notifications, settings, audit, research, attachments, accommodation photos.

## 2. Existing feature inventory

Status meaning: **COMPLETED** = backend + UI + tests exist and were verified on this baseline; **PARTIAL** = works but does not cover the enterprise requirement; **NOT IMPLEMENTED**.

| Area | Status | Evidence |
|---|---|---|
| Crew portal (home, search, booking, reservations, schedule, history, check-in/out, notifications, profile, help) | COMPLETED | routes in `apps/web/src/App.tsx`, E2E suite |
| Management portal (dashboard, reservations, availability, calendar, front desk, housekeeping, maintenance, roster, reports, master data, employees, users, audit, settings) | COMPLETED | routes + 91 Playwright tests on baseline |
| Reservation lifecycle | COMPLETED | CAS transitions, approvals, no-show, cancellation, events (`modules/reservations`) |
| Bed allocation + exclusion constraint | COMPLETED | `bed_allocations` gist exclusion `[)` on HELD/ACTIVE |
| QR check-in/check-out | COMPLETED | hashed QR tokens, reservation/guest binding, housekeeping task on checkout |
| Availability search | COMPLETED | `modules/availability`; readiness window setting |
| Occupancy calendar | COMPLETED (basic) | per-day occupied beds, arrivals/departures, max 62 days |
| Operations dashboard | COMPLETED (basic) | global occupancy KPI and 7-day arrival/departure trend |
| Occupancy report | COMPLETED (basic) | per-dormitory as-of snapshot, CSV/XLSX export |
| Housekeeping | COMPLETED (basic) | task queue, checklist, verify-to-ready, evidence photos |
| Maintenance | COMPLETED (basic) | tickets, transitions, inventory blocks |
| Roster | PARTIAL | mock/HTTP sync, preview/convert recommendations; no occupancy projection |
| Notifications | COMPLETED | in-app + mock/email/Telegram delivery rows |
| Reports | PARTIAL | CSV/XLSX only, no PDF, no scheduled reports |
| Master data / imports | COMPLETED | dormitory→building→floor→room→bed tree, employee/master imports |
| Research candidates | COMPLETED | public-source research register, promote to dormitory |
| Audit log | COMPLETED | append-only, admin UI |
| Policies | PARTIAL | `accommodation_policies` CRUD used for roster recommendations; no versions, simulation or evaluation log |
| Integration exceptions | PARTIAL | generic `integration_exceptions` table; no reservation exception workflow/UI |

## 3. Data model inventory (relevant to this programme)

Existing: `Location`, `Dormitory`, `Building`, `Floor`, `RoomType`, `Room`, `Bed`, `Facility`, `RoomFacility`, `InventoryBlock`, `Reservation`, `ReservationGuest`, `BedAllocation`, `ReservationEvent`, `ReservationApproval`, `CheckinRecord`, `CheckoutRecord`, `QrToken`, `HousekeepingTask`, `HousekeepingChecklistItem`, `MaintenanceTicket`, `RosterAssignment`, `AccommodationPolicy`, `AccommodationRecommendation`, `RosterSyncRun`, `IntegrationException`, `Notification*`, `Attachment`, `AuditLog`.

Missing for the enterprise scope: occupancy snapshots/forecasts, asset registry and inspections, policy versions/evaluations, reservation exception cases and resolutions, housekeeping SLA configuration/history, KPI definitions/analytics read models, AI interaction logs, floor-plan configuration.

## 4. Quality findings (baseline)

1. **Occupancy capacity is defined three different ways.** Dashboard counts ACTIVE beds in ACTIVE rooms; reports also filter ACTIVE rooms; calendar counts every bed under an ACTIVE dormitory without filtering room/building status. Result: the same day can show different denominators. This programme centralizes the predicate.
2. **No single bed-status model.** `RESERVED`, `OCCUPIED`, `CLEANING`, `MAINTENANCE`, `BLOCKED` must be derived from allocations, housekeeping fields/tasks and inventory blocks. No API exposes this classification.
3. **No occupancy history/forecast.** Only live computations and the dashboard's 7-day arrival/departure bars. `RosterAssignment` and `AccommodationRecommendation` exist but are not projected to bed demand.
4. **No asset registry.** Facilities exist as room attributes; there is no serialized asset, condition, QR or lifecycle.
5. **No reservation exception centre.** Conflicts are surfaced as errors/409s but not queued with severity, ownership and resolution trail.
6. **Policy engine is minimal.** No versioning, conflict detection, dry-run or evaluation log; `approvalMode` only.
7. **No BI layer.** KPIs are computed ad hoc; no definition catalogue, no analytical read models, no PDF export, no scheduled reports.
8. **No AI assistant or provider abstraction.**
9. **Housekeeping SLA is not configurable**; status vocabulary lacks explicit `ASSIGNED` / `WAITING_VERIFICATION` / `REJECTED` (assignment and verification are modelled differently today).
10. **Floor plan is text/tree only**; no room/bed QR identity outside reservations.
11. **Known deferred issues** (unchanged by this programme start): gender-policy enforcement, overlapping personal reservations, Telegram binding verification code, session cap, OpenAPI coverage for all routes, E2E fixture reset, frontend unit tests, 44px touch targets, raw enum copy, dependency advisories that require breaking downgrades.

## 5. Baseline verification

| Check | Result |
|---|---|
| Root typecheck / lint / production web build | pass (2026-11-23) |
| Unit tests | 53/53 |
| Integration tests | 122/122 |
| Playwright E2E | 91/91 (17.8 min, isolated `whoosh_stay_e2e`) |
| Dev crawl | 50 views (anonymous, admin, crew, mobile): no error boundary, 5xx, overflow or broken images; employee router import regression fixed before commit |
| Design audit | 130 findings, all waived on record; no new findings in touched files |

## 6. Constraints carried into the programme

- Keep the existing stack, routes, RBAC and design system; no new project, no rebuild.
- No destructive DB operations; migrations are additive raw SQL; `SEED_DEMO=false` in dev unless explicitly seeded, production refuses demo seeds.
- No invented KCIC policies/data; external integrations remain mock/disabled until contracts and credentials exist.
- Server-side authorization only; never rely on hidden menus.
- Truthful analytics: no fabricated forecasts or KPI values.
- Sidebar background stays `#8B1A1A`.
