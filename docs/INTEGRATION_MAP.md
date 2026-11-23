# Full-Stack Integration Map — WHOOSH STAY

**Date:** 2026-11-22 · **Phase:** 12 (master full-stack brief) · **Decision:** D-050

Every operational feature follows the same chain:

```
React page/component
  → client-side validation (zod-derived forms, shared contract)
  → lib/api.ts apiRequest (credentials: include, JSON envelope, ApiError, SESSION_EXPIRED_EVENT)
  → Express route (apps/api/src/modules/<module>/routes.ts)
  → auth middleware (session cookie → principal) + requirePermission + scope guard
  → handler/service (business rules, transactions)
  → Prisma client → PostgreSQL (constraints, triggers)
  → sendSuccess/sendError envelope ({ success, data | error, meta.requestId })
  → TanStack Query cache/state → UI confirmation (toast, badge, list refresh, audit trail)
```

Cross-cutting guarantees: deny-by-default `requirePermission` on every business route; scope predicates (`lib/scope.ts`) applied in lists, details and exports; server-derived principal (never client-trusted); append-only `audit_logs` (trigger rejects UPDATE/DELETE with `42501`); `bed_allocations_no_overlap` EXCLUDE constraint → `409 BED_ALLOCATION_CONFLICT`; zod validation at the boundary (`lib/validate.ts`); pino structured logs with redaction; helmet + Origin allow-list on unsafe methods + auth rate limiter.

---

## 1. Authentication & admin bootstrap

| Step | Password login | Secure bootstrap |
|---|---|---|
| UI | `pages/LoginPage.tsx` (email + password, show/hide, inline error) | CLI only — `apps/api/src/database/bootstrap-admin.ts` |
| Client validation | shared `passwordLoginSchema` | min 12 chars; rejects `@demo.whoosh-stay.local`; never overwrites existing user |
| API | `POST /api/v1/auth/login` (`modules/auth/routes.ts`) | direct Prisma transaction |
| Auth/RBAC | public endpoint; generic 401 "Email atau password salah." (no enumeration); SUSPENDED/DISABLED → 403 | creates GLOBAL SYSTEM_ADMIN role assignment |
| Service | scrypt verify (`scrypt$salt$hash`), session create, `lastLoginAt` update | `randomBytes(18)` one-time password if none supplied; scrypt hash |
| DB | `users`, `sessions`; failed attempt → `audit_logs` AUTH_LOGIN_FAILED (actorUserId null) | `users` + `user_roles` + `audit_logs` ADMIN_BOOTSTRAP in one `$transaction` |
| Response/state | `AuthMe` → `AuthProvider` `setQueryData(['auth','me'])` → redirect by role | password printed exactly once to stdout |
| Mode gating | `AUTH_MODE=password\|oidc\|mock`; `dev-login` mounted only in mock non-prod (404 otherwise); production refuses mock | `GET /auth/config` exposes mode; web gates all demo displays via `useIsDemoEnv()` |

Tests: `auth-password.test.ts` 8/8, `env.test.ts` 9/9, E2E `auth.spec.ts`.

## 2. Master data — locations (D-047)

`pages/MasterDataPage.tsx` (Organisasi → Lokasi tab) → shared location schema → `GET/POST /api/v1/master-data/locations`, `PATCH …/:id` (`modules/master-data/routes.ts`) → `locations.read` / `locations.manage` (manage requires GLOBAL) → duplicate code 409; deactivation blocked while ACTIVE dormitories linked 409 → Prisma `locations` (unique code) + `dormitories.locationId` FK (SET NULL) → `LOCATION_CREATE/UPDATE` audit → list refresh + "5 data" pagination. Excel export entity `locations` (global scope). Tests: `locations.test.ts` 6/6, E2E `master-data-access.spec.ts`.

## 3. Employee Excel import (D-048)

`pages/EmployeesPage.tsx` (embedded in Master Data → Karyawan → Data Karyawan; also reachable at `/manage/employees`) → `ExcelImportPanel` (template download, labeled file input) → `GET /employees/import-template`, `POST /employees/import/preview` (multer memory 2 MB, ZIP magic, `read-excel-file` v9, exact header contract, per-row zod + intra-file duplicate + cross-source conflict + homeStation must match ACTIVE Location) → `employees.import` + GLOBAL guard → preview persists `employee_import_batches`/`employee_import_rows` → ConfirmDialog → `POST /employees/import/:batchId/commit` (PREVIEWED-only, 409 on repeat; single `$transaction` re-validates each row, upserts by `(sourceSystem='IMPORT', externalEmployeeId)`, writes batch counts + `EmployeeSyncLog` inside the transaction) → `EMPLOYEE_IMPORT_COMMIT` audit → success summary + history list (`GET …/batches`, `…/batches/:id`). Invalid rows never committed, remain visible per-row. Tests: `employees-import.test.ts` 5/5, E2E `employee-import.spec.ts` 2/2.

## 4. Accommodation Excel import (D-049)

`MasterDataPage` subs unit-akomodasi/gedung/kamar/tempat-tidur → `MasterImportPanel` → `GET/POST /master-data/import-template|preview?entity`, `POST /master-data/import/:batchId/commit`, `GET …/batches?entity` → permission per entity reuses `dormitories.create`/`buildings.manage`/`rooms.create`/`beds.manage` + GLOBAL guard → parents must exist (no auto-creation); dormitory `locationCode` must be ACTIVE; UPDATE never touches operational/housekeeping status, eligibility, capacity, address, contacts, coordinates; commit revalidates references in one `$transaction` (60 s), skipped rows marked INVALID with reasons → `master_import_batches`/`master_import_rows` → `MASTER_IMPORT_*` audits → history + detail reopen. Tests: `master-import.test.ts` 6/6, E2E `master-import.spec.ts` 2/2.

## 5. Reservation lifecycle

`pages/CrewSearchPage.tsx`/`CrewBookingPage.tsx` (availability-driven bed choice) → `createReservationSchema` → `POST /api/v1/reservations` (`modules/reservations/routes.ts`) → `reservations.create` + scope (`selfOnly` crew) → idempotency replay check → eligibility (ACTIVE, not INELIGIBLE) → Jakarta-date validation (check-in ≥ today, ≤ 14 nights) → `$transaction`: `findAvailableBeds` recheck → `SELECT … FOR UPDATE` bed locks → `reservations` + `bed_allocations` (HELD) + guests + events → EXCLUDE constraint backstop (23P01 → 409) → `PENDING_APPROVAL` (policy) → crew list/detail refresh + JourneyBar. Approval: `POST …/:id/approve|reject` (`reservations.approve`, manager) → CONFIRMED/REJECTED + allocation release + notifications. Tests: `reservations-flow.test.ts` 5/5 (lifecycle, concurrency 201+409, rejection, cross-crew 403), E2E crew booking.

## 6. Stay operations (QR / check-in / check-out)

Crew detail → `POST /reservations/:id/qr` (`modules/stays/routes.ts`, `stays.read`) → 32-byte token, SHA-256 hash stored, single active QR per occupant, expiry ≤ stay end → front desk `POST /stays/validate-qr` (`stays.check_in`) → hash/expiry/consumed checks + `canCheckIn` (CONFIRMED && Jakarta today within [checkIn, checkOut)) → `POST /stays/check-in` → readiness guard (bed/room ACTIVE+READY, no inventory block) → CHECKED_IN + allocation ACTIVE + checkins row → reused QR 409 `QR_ALREADY_USED` → `POST /stays/check-out` → CHECKED_OUT + allocation RELEASED + housekeeping task PENDING + room DIRTY → audits + notifications. Tests: lifecycle integration, E2E front desk.

## 7. Housekeeping & maintenance

`HousekeepingPage`/`MaintenancePage` → `/housekeeping/tasks*`, `/maintenance/tickets*` → role permissions + scope → task state machine (start/complete/verify; verify marks room READY when no other open task) / ticket blocking (`inventory_blocks` prevents allocation & check-in until resolved) → Prisma + audits → KPI strips refresh. Tests: `operations.test.ts`, E2E page loads.

## 8. Dashboard & analytics (Phase 8)

`pages/DashboardPage.tsx` → `GET /api/v1/dashboard/overview` + analytics endpoints (`modules/dashboard`) → `dashboard.read` + scope → **all figures computed from PostgreSQL**: occupancy = occupied beds / operational usable beds × 100 % (maintenance excluded); arrivals/departures, pending approvals, readiness, 7-day trend → honest zeros when empty ("0 dari 0 tempat tidur terisi") → integration-status labels reflect real adapter config (MOCK labelled "Adapter mock (uji)"). No fabricated KPIs. Tests: `analytics-summary.test.ts`, E2E dashboard.

## 9. Notifications

Bell-only header centre + `CrewNotificationsPage` → `/notifications*` (`modules/notifications`) → self-only scope → in-app rows + `notification_deliveries` → mark-read/mark-all mutations → unread badge. External delivery uses SMTP/Telegram adapters when credentials are set **and** the admin settings flags (`notifications.emailEnabled` / `notifications.telegramEnabled`) are on; otherwise rows stay `MOCK_DELIVERED`. Users bind their own Telegram chat via `GET/PUT /api/v1/auth/me/telegram` (audited `USER_TELEGRAM_CHAT_UPDATED`). Tests: integration + unit (providers) + E2E notification centre.

## 10. Reports & export

`ReportsPage` (reservations/occupancy/operational tabs) → `/reports/*`, `/reports/export?format=csv|xlsx` (`modules/reports`) → `assertReportAccess` (SELF-only → 403; never widened) → same scope predicates as source lists → `write-excel-file` XLSX (signature asserted) → export audited. Tests: integration + E2E download.

## 11. Accommodation photos (Phase 9)

`ManagementGalleryPage` → `/accommodation/gallery`, photo upload/reorder/cover/delete (`modules/accommodation`, `photos.manage`) → MinIO storage (API-only streaming; credentials never exposed to frontend) → `accommodation_photos` rows → crew gallery/lightbox. **Authenticity audit:** all 180 original demo photos + 361 MinIO objects purged (D-050); the dev database now holds 160 clearly labelled synthetic demo photos generated locally on user request (`seed-dev-demo.ts` → `demo-photos.ts`, captions end "(foto demo sintetis)"; `purge:demo` removes rows + objects). No external/copyrighted imagery. Tests: gallery integration + E2E lightbox (fixture).

## 12. Demo purge & isolation (Phase 13, D-050)

CLI `apps/api/src/database/purge-demo.ts --execute` → refuses test/e2e URLs → origin gate (aborts on any non-demo operational row) → verified backup + restore drill first → single `$transaction` FK-ordered deletes → demo users **isolated** (DISABLED, null hashes, roles/sessions removed) because append-only audit forbids deleting actors → post-commit MinIO cleanup → psql-verified end state. Rollback point: `backups/whoosh_stay-20261121T164157Z.dump` (SHA-256 `42a5f658…`).

---

## External integration status (honest, no fabrication)

| Integration | Adapter | Status |
|---|---|---|
| KCIC SSO (OIDC) | real adapter implemented | BLOCKED — official issuer/client/secret not supplied; nothing invented |
| HR employee sync | real HTTP adapter implemented; MOCK default | `EMPLOYEE_SYNC_ENABLED=false` keeps the MOCK provider and production refuses the flag; enabling requires base URL + auth per `.env.example` |
| Duty roster sync | MOCK_ROSTER | labelled in UI; `ROSTER_SYNC_ENABLED=false`; never mutates confirmed reservations |
| Email / Telegram delivery | real SMTP + Telegram adapters implemented; MOCK default | `EMAIL_PROVIDER=mock` / empty `TELEGRAM_BOT_TOKEN` keep `MOCK_DELIVERED`; real sending also requires the per-channel system setting |
| PostgreSQL / MinIO | real | running locally (Docker 5433 / 9110); production profile authored, not deployed |

See `DATA_READINESS.md` for what is verified/imported/isolated/unavailable, and `IMPLEMENTATION_STATUS.md` §3 for executed test evidence.