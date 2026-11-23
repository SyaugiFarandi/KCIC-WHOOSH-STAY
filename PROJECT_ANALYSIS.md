# Whoosh Stay — Project Analysis

**Phase:** Discovery (Roadmap Phase 0; requested as "Phase 1 — Project Discovery")
**Date:** 2026-11-21
**Status:** Complete. No application code written. Implementation paused pending instruction.
**Implementation update (2026-11-21):** Phases 2–7 were subsequently authorized and executed. The invariants in §1 were implemented and tested (allocation exclusion, interval availability, transactional revalidation, append-only audit, mock-only integrations). Attachments, calendar, XLSX/PDF, performance and production operations remain open — see `IMPLEMENTATION_STATUS.md` §5.
**Inputs:** All 14 project documents + `PACKAGE_MANIFEST.json` read in full.

---

## 1. Executive summary

Whoosh Stay is an internal KCIC crew accommodation and dormitory management platform, delivered as two portals over one API:

- **Crew Portal** — hospitality-first search, booking, stay schedule, QR check-in credential.
- **Management Portal** — eight enterprise modules plus profile: Dashboard, Reservasi Penginapan, Manajemen Dormitory, Operasional Penginapan, Housekeeping & Maintenance, Integrasi Jadwal Dinas, Laporan & Analitik, Pengaturan & Master Data.

Reservation is hybrid: manual crew bookings, admin bookings, and roster-informed recommendations with controlled conversion. A single availability, validation and allocation engine serves all sources.

Non-negotiable invariants (drive the architecture):

1. Bed-level availability over `[check_in, check_out)`; overlap = `existing.start < requested.end AND requested.start < existing.end`.
2. Search is advisory; availability is revalidated transactionally at write.
3. No overlapping active/held allocation for a bed, enforced by PostgreSQL exclusion constraint plus row locking.
4. Reservation status follows an explicit state machine; no arbitrary status writes.
5. Inventory readiness (housekeeping/maintenance) is separate from reservation status.
6. Roster updates never silently mutate confirmed bookings; default behavior is recommendation/pending.
7. Backend is authoritative for eligibility, availability, allocation, permissions and scope.
8. QR tokens are random, expiring, single-use and stored hashed; identity verification remains staff-controlled.
9. All state changes, overrides and approvals are auditable.
10. External integrations sit behind adapters and feature flags; no fabricated KCIC endpoints or data.

---

## 2. Repository and environment findings

| Item | Finding | Implication |
|---|---|---|
| Application code | None. Only specification markdown. | Greenfield scaffold; no existing stack to preserve. |
| Directory shape | `WHOOSH_STAY_QODER_PACKAGE/WHOOSH_STAY_QODER_PACKAGE/` contains all docs; `docs/` duplicates them. | Treat outer workspace as repository root; consolidate specs into `/docs` during scaffold. |
| Git | Folder is not a git repository. | `git init` at scaffold; add `.gitignore` before first commit. |
| Node.js | v24.21.0 | Satisfies baseline; no runtime constraint. |
| npm | 11.19.0 | Use npm workspaces; pnpm not installed. |
| Docker | 29.9.3, Compose v5.7.0 | PostgreSQL and MinIO via Compose; integration tests target Compose DB. |
| psql client | Not installed | Use `docker compose exec postgres psql` for DB tasks. |
| OS | Windows 10.0.26300, Git Bash | Scripts must be cross-platform (Node scripts, not Bash-only). |

No code, migrations, tests, CI configuration or environment files exist. Nothing can be verified beyond tool availability until scaffold.

---

## 3. Recommended technology stack

Baseline confirmed from `README.md`; deviations are limited to what the environment requires.

| Layer | Choice | Notes / rationale |
|---|---|---|
| Repository | npm workspaces monorepo: `apps/api`, `apps/web`, `packages/shared` | npm 11 available; pnpm absent. One lockfile, one test baseline. |
| Frontend | React + Vite + TypeScript (strict) | Baseline. React Router (library mode), TanStack Query, React Hook Form + Zod. |
| Styling | Tailwind CSS + CSS-variable design tokens + Radix primitives | Two distinct visual systems (warm hospitality vs charcoal enterprise) without a heavy UI kit. |
| Charts | Recharts | Dashboard/report charts only where data exists; no decorative charts. |
| Dates | `date-fns` + `date-fns-tz`; `Intl` formatting | Date-only stay semantics; Asia/Jakarta display boundaries. |
| Backend | Node 24 + Express 5 + TypeScript (strict) | Baseline is Express; v5 gives native async error propagation. Pin exact versions at scaffold. |
| Validation | Zod | Request/response DTOs, query filters, policy `criteria`/`rules` documents, shared client schemas. |
| ORM / migrations | Prisma, latest stable compatible with Node 24; pinned at scaffold | Baseline. Raw SQL migrations for `btree_gist`, exclusion constraint, triggers. `prisma db push` is prohibited. |
| Database | PostgreSQL 16 (Compose image), UTC storage | Exclusion constraint, partial unique indexes, FK restrict, check constraints. |
| Auth | OIDC Authorization Code + PKCE via `openid-client`; backend opaque session cookie; dev mock provider | No tokens in localStorage. Mock auth refused when `NODE_ENV=production`. |
| Storage | MinIO (S3-compatible), private buckets, signed URLs | Compose service + init job. Upload validation and entity authorization. |
| Jobs | In-process worker with DB-backed delivery logs and a periodic sweeper | No Redis initially; idempotent, resumable operations. |
| API docs | OpenAPI 3.1 generated from Zod schemas; Swagger UI in dev only | Contract is generated from implementation, not hand-copied. |
| Exports | `exceljs` (XLSX), `pdfkit` (PDF) | Formula-injection sanitization; scoped rows; row cap. |
| Logging | `pino` + `pino-http`, correlation/request ID, redaction | Structured JSON; no tokens/PII. |
| Security middleware | `helmet`, `express-rate-limit`, `cookie-parser`, strict CORS (same-origin) | Deny by default; CSRF mitigated via SameSite=Lax cookies + custom header check. |
| Testing | Vitest, Supertest, Playwright; k6 (Docker) for load | Integration tests against Compose PostgreSQL. |
| Runtime | Docker Compose (postgres, minio, minio-init, api, web); Nginx for production profile | Health checks for all services. |
| Realtime | Deferred. Polling/refetch in v1 | Socket.IO optional per architecture doc; not required for correctness (P2). |

Explicit non-choices: microservices, Redis, Socket.IO, GraphQL, public marketplace, OTA/payments, driver/vehicle tracking, payroll/attendance, roster authoring, native mobile apps.

---

## 4. Implementation architecture

### 4.1 Shape

Modular monolith with explicit module facades. Request flow:

`Browser → Nginx (prod) / Vite proxy (dev) → Express /api/v1 → router → auth → validation → RBAC + scope → service (domain) → Prisma/SQL → PostgreSQL`

Cross-cutting: config validation, error envelope, request context, audit, idempotency, pagination, OpenAPI, storage, job runner.

### 4.2 Backend modules (owned boundaries)

| Module | Owns | Public facade |
|---|---|---|
| `config` | Env parsing, feature flags, startup guards | `config` |
| `auth` | OIDC adapter, mock provider, sessions, `/auth/*` | `AuthService`, `IdentityProvider` |
| `users-rbac` | Users, roles, permissions, assignments, scope resolution | `AccessService`, `requirePermission` |
| `employees` | Employee mirror, eligibility profile, sync logs | `EmployeeDirectory` |
| `dormitories` | Dormitory → building → floor → room → bed, facilities, room types, inventory blocks | `InventoryService` |
| `availability` | Read-only availability calculation across intervals | `AvailabilityService` |
| `reservations` | Reservation aggregate, state machine, approvals, guests, events | `ReservationService` |
| `allocations` | Preview, execute, reassign, release, conflict queue | `AllocationService` |
| `stays` | Check-in/out, QR lifecycle, active occupants | `StayService` |
| `housekeeping` | Tasks, checklists, readiness transitions | `HousekeepingService` |
| `maintenance` | Tickets, inventory blocking, resolution | `MaintenanceService` |
| `roster` | Providers, sync runs, policy evaluation, recommendations, exceptions | `RosterService` |
| `notifications` | In-app center, templates, adapters, deliveries | `NotificationService` |
| `reports` | Scoped aggregations and exports | `ReportService` |
| `audit` | Append-only events | `AuditService` |
| `settings` | Runtime policies/flags, master data | `SettingsService` |
| `files` | Attachments, signed URLs | `FileService` |
| `dashboard` | KPI composition from other facades | `DashboardService` |

Rules: no cross-module imports of private files; read other modules through facades; availability never writes; allocation is the only writer of `bed_allocations`; reservation state changes only through `ReservationService` commands.

### 4.3 Reservation/allocation transaction design

1. Authenticate; confirm employee link; validate DTO and policy.
2. Open transaction; resolve idempotency (`source` + `idempotency_key` unique).
3. Recompute availability inside the transaction with the same predicates as search.
4. Lock candidate bed rows deterministically (`ORDER BY bed_id ... FOR UPDATE`) to reduce deadlock.
5. Insert reservation, guests, allocations (`HELD` or `ACTIVE` per workflow), event, audit.
6. DB exclusion constraint is the final backstop; map SQLSTATE `23P01` to `409 BED_ALLOCATION_CONFLICT`.
7. Commit; dispatch notifications after commit (failure never rolls back booking).

Retry serialization failures (`40001`) up to 3 times. Group allocation commits all beds atomically.

### 4.4 Frontend architecture

- Two layouts: `CrewLayout` (warm, hospitality) and `ManagementLayout` (charcoal sidebar, dense), sharing tokens and primitives only.
- Feature modules mirror backend domains; pages fetch real API data; no mock UI data.
- `packages/shared` holds permission codes, status enums, API envelope types and Zod DTO schemas (client validation is UX, never authority).
- Typed `apiClient`: envelope parsing, error-code mapping, request ID, 401/403 handling.
- Route guards from `/auth/me` permissions; server remains authoritative. Permission-aware nav collapses unavailable modules.
- URL search params persist filters/pagination (preserve on back).
- Required states per page: loading skeleton, empty, error, permission-denied, integration-unavailable, success.
- Crew mobile-first booking/QR; management tables paginate server-side; no horizontal page overflow.
- Indonesian copy via typed message dictionary; identifiers/API stay English.

### 4.5 Repository layout (target)

```text
/ (workspace root)
  AGENTS.md  README.md  PACKAGE_MANIFEST.json
  docs/                       # consolidated specs + living docs
  apps/api/                   # Express API, Prisma schema/migrations, jobs
  apps/web/                   # React app (crew + management)
  packages/shared/            # codes, DTO schemas, types
  infrastructure/docker/      # init scripts, nginx config
  docker-compose.yml
  .env.example
  package.json                # workspaces + root scripts
```

---

## 5. Data model review

37 documented tables in eight groups:

| Group | Tables |
|---|---|
| Identity (5) | users, roles, permissions, user_roles, role_permissions |
| Employee (2) | employees, employee_sync_logs |
| Inventory (9) | dormitories, buildings, floors, room_types, rooms, beds, facilities, room_facilities, inventory_blocks |
| Booking (5) | reservations, reservation_guests, bed_allocations, reservation_events, reservation_approvals |
| Stay (3) | checkin_records, checkout_records, qr_tokens |
| Ops (3) | housekeeping_tasks, housekeeping_checklist_items, maintenance_tickets |
| Roster (5) | roster_assignments, accommodation_policies, accommodation_recommendations, roster_sync_runs, integration_exceptions |
| Platform (5) | notifications, notification_templates, notification_deliveries, attachments, audit_logs |

Key constraints to implement:

- `EXCLUDE USING gist (bed_id WITH =, daterange(stay_start, stay_end, '[)') WITH &&) WHERE (status IN ('HELD','ACTIVE'))`, requires `btree_gist`.
- Unique `(source, idempotency_key)` where key is not null; unique `(source_system, external_roster_id)`; unique `(reservation_id, employee_id)` on guests and check-in/out records; unique `(event_code, channel)` on templates.
- Check constraints: date ranges, positive occupants/capacity, inventory block exactly one target and `end_at > start_at`.
- Partial unique active QR token per reservation+employee (rotation allowed after expiry/consume).
- FK `RESTRICT` on historical entities; state transitions instead of hard deletes.

### 5.1 Required schema amendments

| Amendment | Reason | Ref |
|---|---|---|
| `beds.housekeeping_status` (READY/DIRTY/CLEANING/INSPECTION_REQUIRED), `beds.status_reason`, `updated_at` | Requirements demand bed-level readiness; current schema only has bed operational status | D-006 |
| `sessions` table (token hash, user, expiry, revocation, last seen) | Backend opaque session strategy with logout/revocation | D-004 |
| `system_settings` (key, jsonb value, description, updated_by, updated_at) | Runtime feature flags/thresholds beyond accommodation policies | D-006, D-022 |
| Immutability trigger on `audit_logs` blocking UPDATE/DELETE | Append-only requirement | D-017 |
| Indexes for QR lookup/active token partial unique; attachments by entity | Query correctness and performance | D-006 |

Deferred: employee gender/rooming attribute. `rooms.gender_policy` exists but no employee attribute does; enforcing rooming policy requires a sensitive field and official confirmation (data minimization). Rooms default `UNSPECIFIED` with no enforcement until approved (risk R-25).

### 5.2 Domain semantics decisions

- Stay interval is date-only `[check_in_date, check_out_date)`. Same-day turnover is allowed by interval logic, subject to readiness.
- `inventory_blocks` uses timestamptz; effective blocked dates are computed conservatively in Asia/Jakarta: first blocked date = local date of `start_at`; last blocked date = local date of `end_at - 1s`; overlap tested against stay dates.
- Readiness vs future bookings: blocks/operational status always exclude inventory. Bed readiness is enforced for stays starting within a configurable window (proposed 24h) and rechecked at check-in; outside the window, transient dirtiness does not block future-dated booking. Requires stakeholder approval of the window (D-008).
- Group stays: reservation becomes `CHECKED_IN` on first guest check-in; `CHECKED_OUT` only when all guests are checked out; per-guest truth lives in `checkin_records`/`checkout_records` (D-010).
- One dormitory per reservation in v1; cross-dormitory groups deferred (D-017).
- `reservation.status` is authoritative; `approval_status` mirrors approval workflow only (NOT_REQUIRED/PENDING/APPROVED/REJECTED).

---

## 6. API review

Conventions adopted as written: `/api/v1`, success/error envelopes, `meta.requestId`, pagination `page`/`pageSize` (default 15, max 100), allowlisted sorting, `Idempotency-Key`, stable error codes, 403/409/422 semantics (400 for malformed payloads, 429 for rate limits).

### 6.1 Endpoints planned to add (documented gaps)

| Area | Addition | Why |
|---|---|---|
| Auth | `POST /auth/login`, `GET /auth/callback`, `POST /auth/dev-login` (dev only) | OIDC code flow and gated local login were unspecified |
| Crew home | `GET /my/summary`, `GET /my/schedule` | Crew must not depend on management `dashboard.read` |
| QR | `POST /my/reservations/:id/qr-token`, `GET /my/reservations/:id/qr-eligibility` | Token issuance/eligibility endpoint missing; raw token returned once only |
| Users/RBAC | `GET/POST /admin/users`, `PATCH /admin/users/:id`, `PUT /admin/users/:id/roles` | `users.manage` permission had no endpoints |
| Employees | `GET /employees`, `GET /employees/:id` (scoped) | Master Karyawan page and admin booking picker |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` | In-app notification center required |
| Settings | `GET /admin/settings`, `PATCH /admin/settings/:key` | Runtime flags/thresholds (no secrets) |
| Files | `POST /attachments`, `GET /attachments/:id/url`, authz by entity | Evidence/images storage requirement |
| Reports | XLSX/PDF for stays, usage, housekeeping, maintenance | API listed only occupancy/reservations exports |
| Health | `GET /health/live`, `GET /health/ready` (outside `/api/v1`) | Operational readiness |

### 6.2 Contract details to make explicit

- Permissions: API referenced `reports.occupancy.read`; catalog has `reports.read`. Standardize on catalog; map endpoint permission to `reports.read` (D-005).
- Check-in: `qr/validate` returns minimal summary plus a signed short-lived validation token; `check-in/confirm` consumes the QR token transactionally and is idempotent (unique constraint). Prevents validate/confirm replay races (D-012).
- Error mapping: `23P01` → `BED_ALLOCATION_CONFLICT` (409); duplicate QR → `QR_ALREADY_USED`; expired → `QR_EXPIRED`; duplicate sync → idempotent success/updated counts.
- Exports: same scope predicate as list; formula-injection sanitization; 50,000-row cap → `422 EXPORT_TOO_LARGE` with filter guidance.
- OpenAPI generated from Zod; route registry test asserts every protected route declares a permission and required scope.

---

## 7. RBAC and security design

Roles and baseline matrix adopted. Enforcement in three layers:

1. **Route registry** — every route declares permission code and scope requirement; a test enumerates routes and fails on unprotected routes (deny by default).
2. **Permission middleware** — checks effective permissions from DB role assignments, never client claims.
3. **Scope resolver** — turns scopes into query predicates: `GLOBAL`, `DORMITORY`, `BUILDING`, `ASSIGNED_TASK`, `SELF`. Object-level guard on every record route; exports reuse the same predicate builder.

Additional permission codes required by documented behavior: `reservations.create_for_others`, `settings.manage`, `attachments.upload`, `attachments.read`. Crew endpoints use `SELF`; no `dashboard.read` needed. Separation of duties: no self-approval, front desk cannot edit policies, housekeeping cannot approve reservations, maintenance cannot clear readiness without verification.

Security controls: OIDC issuer/audience/signature/expiry/nonce validation; same-site session cookie; CSRF header check; rate limits on auth, QR and exports; upload MIME/size validation; signed URLs; PII/token redaction in logs; audit without secrets/full QR tokens; production startup refuses mock auth or missing OIDC config.

---

## 8. Frontend module and route map

### 8.1 Crew Portal

| Page | Route | Data |
|---|---|---|
| Beranda | `/` | `/my/summary`, recommendations |
| Cari Penginapan | `/search` | `/availability` |
| Dormitory detail | `/dormitories/:id` | dormitory + room detail, facilities |
| Booking flow | `/book/:dormitoryId` | reservation create, policy/approval preview |
| Reservasi Saya | `/reservations`, `/reservations/:id` | scoped list/detail, timeline, QR |
| Jadwal Menginap | `/schedule` | `/my/schedule` |
| Riwayat | `/reservations?tab=history` | completed/cancelled tabs |
| Notifikasi | `/notifications` | in-app center |
| Profil / Bantuan | `/profile`, `/help` | own profile, preferences, help |
| Dibutuhkan | `/forbidden`, `/not-found`, offline state | shared states |

History is a tab of Reservasi Saya (PRD lists "Riwayat"; UI nav lists Jadwal Menginap). No separate duplicate page unless navigation demands it (D-024).

### 8.2 Management Portal (every submenu maps to a route)

| Module | Routes |
|---|---|
| Dashboard | `/manage/dashboard` |
| Reservasi Penginapan | `/manage/reservations/search`, `/manage/reservations`, `/manage/reservations/approvals`, `/manage/reservations/roster`, `/manage/reservations/history`, `/manage/reservations/cancellations` |
| Manajemen Dormitory | `/manage/dormitories`, `/manage/buildings`, `/manage/floors`, `/manage/rooms`, `/manage/beds`, `/manage/facilities`, `/manage/availability` |
| Operasional Penginapan | `/manage/operations/check-in`, `/check-out`, `/occupants`, `/allocations`, `/transfers`, `/calendar` |
| Housekeeping & Maintenance | `/manage/housekeeping/tasks`, `/manage/housekeeping/rooms`, `/manage/maintenance/reports`, `/manage/maintenance/work-orders`, `/manage/maintenance/history` |
| Integrasi Jadwal Dinas | `/manage/roster/sync`, `/schedule`, `/recommendations`, `/generated`, `/exceptions`, `/logs` |
| Laporan & Analitik | `/manage/reports/occupancy`, `/reservations`, `/usage`, `/stays`, `/housekeeping`, `/maintenance`, `/exports` |
| Pengaturan & Master Data | `/manage/settings/employees`, `/departments`, `/room-types`, `/facilities`, `/reservation-rules`, `/stay-policies`, `/users`, `/notifications`, `/audit-logs` |
| Profil Saya | `/manage/profile` |

Shared components: `DataTable` (server pagination/sort), `StatusBadge` (text + icon, not color alone), `PageHeader`, `FilterBar`, `DateRangePicker`, `EmptyState`, `ErrorState`, `PermissionDenied`, `ConfirmDialog`, `Skeleton`, `FormField`, `Timeline`, `OccupancyCalendar`, `RoomBedMap`, `QrPanel`.

---

## 9. Integration and mock strategy

| Capability | Development (real now) | Adapter | Feature flag / guard | Official input required |
|---|---|---|---|---|
| SSO | Mock auth provider with seeded users per role | `IdentityProvider`; OIDC implementation | `AUTH_MODE=mock` refused in production | ZITADEL issuer, client, scopes, redirect URIs |
| Employee API | Deterministic synthetic employees | `EmployeeDirectoryProvider`; `MockEmployeeProvider`; `KcicEmployeeProvider` stub throws `INTEGRATION_UNAVAILABLE` | `EMPLOYEE_SYNC_ENABLED=false` | API contract, auth model, matching key |
| Roster API | Deterministic finalized/draft fixtures | `RosterProvider`; `MockRosterProvider`; `KcicRosterProvider` stub | `ROSTER_SYNC_ENABLED=false`; auto-confirm off | API contract, finalized-status semantics |
| Notifications | In-app center (real) | `NotificationChannel`; console/DB channel; SMTP/Telegram adapters disabled | Credentials absent ⇒ disabled | Provider, recipients, templates |
| Storage | MinIO (real) | S3-compatible adapter | Compose-provided | None for local; production bucket policy |
| QR | Real | None (native crypto) | — | Check-in window policy confirmation |
| Reports/exports | Real | None | — | KPI definitions confirmation |

Must **not** be mocked: availability, allocation, concurrency control, RBAC/scope, state machine, audit, QR, readiness. These are core correctness.

Missing-input rule: adapters expose `describeRequiredInput()`; startup/settings page reports integration status; manual workflows remain usable.

---

## 10. Findings, inconsistencies and resolutions

| # | Finding | Resolution |
|---|---|---|
| 1 | User's "Phase 1: Discovery" collides with roadmap "Phase 1: Foundation" | This work = Roadmap Phase 0. Next execution = Roadmap Phase 1. |
| 2 | Documentation duplicated at package root and `docs/`, nested package folder | Consolidate into root `/docs` at scaffold; keep one source of truth. |
| 3 | AGENTS.md says start Phase 1 automatically; current instruction says stop after discovery | Current explicit instruction wins for this session; implementation paused (recorded in status). |
| 4 | API uses `reports.occupancy.read`; permission catalog lacks it | Standardize on `reports.read`; add only genuinely missing codes (D-005). |
| 5 | PRD management submenu includes "Reservasi Saya (crew scope)"; UI guidelines omits it | Management nav follows UI guidelines; crew-scope page lives only in Crew Portal. |
| 6 | PRD crew "Riwayat" not in crew nav | Implement as Reservasi Saya history tab; no duplicate page. |
| 7 | Bed dirtiness required, but schema has readiness only at room level | Add `beds.housekeeping_status`; room-level readiness aggregates/broadcasts (D-006). |
| 8 | Group check-in vs reservation-level `CHECKED_IN` undefined | Per-guest records; reservation aggregates when first/last guest changes (D-010). |
| 9 | Readiness is instantaneous but availability is future-dated | Configurable readiness window + check-in recheck; proposed 24h (D-008, needs approval). |
| 10 | `inventory_blocks` timestamps vs date-only stays | Conservative Asia/Jakarta date conversion rule (D-009). |
| 11 | No `sessions`, notification/user/attachment/settings/QR endpoints | Additive API and schema extensions (D-006, D-014). |
| 12 | `reservations.approval_status` overlaps `status` | `status` authoritative; `approval_status` is workflow mirror only. |
| 13 | No employee gender field for `rooms.gender_policy` | Do not add until rooming policy approved; policy defaults to unspecified (R-25). |
| 14 | Prisma cannot declare GiST exclusion constraints | Raw SQL migration; prohibit `db push`; migration test verifies constraint (D-007). |
| 15 | One `dormitory_id` per reservation | v1 limitation; cross-dormitory groups deferred (D-017). |
| 16 | `room_types.default_capacity` may differ from actual beds | Availability capacity derives from active beds; `default_capacity` is a creation hint only. |

---

## 11. Stakeholder decisions that can block production

Tracked in `OPEN_DECISIONS.md`; highest impact:

1. Official dormitory/inventory data and station mapping.
2. Employee eligibility rules and matching key.
3. Gender/rooming policy (and whether to store a sensitive attribute at all).
4. Stay-before/after-duty, lead time, maximum duration, extension rules.
5. Readiness window for future-dated bookings (D-008) and housekeeping verification policy.
6. Check-in/out time windows and identity verification at front desk.
7. Approval hierarchy, thresholds and who may book for others.
8. Cancellation/no-show policy.
9. ZITADEL configuration; employee and roster API contracts.
10. Data retention, audit retention, export recipients, production infrastructure.

Safe defaults are implemented as configuration with `RECOMMENDATION_ONLY`/approval-required behavior; automation stays off until approved.

---

## 12. Discovery exit criteria

- All specifications read and reconciled: **met**.
- Stack, architecture, module boundaries, data model, API/RBAC reviews: **documented**.
- Risks, gaps, mocks and open decisions: **documented**.
- No code, dependencies or infrastructure changes: **respected**.
- Ready to execute Roadmap Phase 1 on instruction.
