# Whoosh Stay — Implementation Status

**Last updated:** 2026-11-22
**Current phase:** Roadmap Phases 2–7 executed, plus Phase B attachments/gallery, the full UI/UX redesign, Phases C–M (calendar, XLSX export, security/a11y, CI workflow, production profile, backup/restore drill, demo-data consistency, final regression), the brand/login/sidebar refresh, Master Data with Users & Access tabs and the header notification centre, the management sidebar navigation redesign, location master + employee/accommodation Excel imports (D-047/048/049), the **zero-demo operational baseline** (D-050: password auth, secure admin bootstrap, FK-safe demo purge with isolation, demo-display gating, E2E fixture separation), the **finalization batch** (admin credential rotation, zero-demo sweep re-verification, Phase 10 full regression, Phase 11 reports), the **synthetic employee batch** (S1–S5: 60 labelled SYNTHETIC test profiles, no login accounts, import firewall, purge CLI), the **accommodation research batch** (R1–R7: 36 public research candidates + 65 sources across 5 locations, review/promotion workflow, per-location report), the **IA consolidation batch** (Log Audit and Pengaturan removed from the sidebar; settings merged into Pengguna & Hak Akses as a permission-gated tab; Data Karyawan merged into Master Data; legacy routes redirect under permission guards), and the **dev demo accommodation dataset** (5 labelled `DEMO-*` dormitories, 30 rooms, 150 beds, 160 synthetic photos, 15 demo reservations, 1 demo crew login), and the **external-adapter preparation batch** (D-053: SMTP email, Telegram and HTTP employee-sync adapters shipped inactive, per-user Telegram chat-ID binding) — **implementation complete for the documented scope**, with the caveats in §5.
**Environment:** Development runs `AUTH_MODE=password` against a database holding the verified 5-location master, RBAC base, 1 bootstrap admin with rotated password, and labelled non-operational test data only (60 SYNTHETIC employees, 36 PENDING research candidates, plus the dev-only DEMO accommodation dataset below). No real KCIC credentials, endpoints or employee data are used anywhere; where no verified source exists the system shows honest empty states. The demo accommodation rows are explicitly labelled "(data uji)" in the UI and removable via `purge:demo`. Synthetic fixtures for tests live only in the isolated `whoosh_stay_test` / `whoosh_stay_e2e` databases.

Status vocabulary: NOT STARTED | IN PROGRESS | IMPLEMENTED | TESTED | PARTIALLY VERIFIED | BLOCKED. "TESTED" requires an executed command and a recorded result.

---

## 1. Phase status

| Roadmap phase | Status | Evidence |
|---|---|---|
| 0 — Discovery and plan | COMPLETE | `PROJECT_ANALYSIS.md`, `IMPLEMENTATION_PLAN.md`, `TECHNICAL_RISKS.md`, traceability |
| 1 — Foundation (Gate A) | COMPLETE / TESTED | See §3; Gate A was reported before Phase 2 |
| 2 — Dormitory inventory | COMPLETE / TESTED | Inventory CRUD API + management UI; 5 dormitories / 30 rooms / 150 beds DEMO seed; see §2 |
| 3 — Reservations, availability, allocation | COMPLETE / TESTED | Real-interval availability, transactional allocation, exclusion constraint, approval/rejection, idempotency, concurrency proof |
| 4 — Stay operations | COMPLETE / TESTED | QR issue/validate/check-in/check-out, housekeeping readiness, maintenance blocking, front desk console |
| 5 — Roster automation | COMPLETE (mock provider) / TESTED | Idempotent preview/sync, run history, assignments UI; provider is explicitly `MOCK_ROSTER` |
| 6 — Notifications, reporting, settings | COMPLETE (mock delivery) / TESTED | In-app notifications, delivery log with MOCK statuses, 3 report families + CSV/XLSX export, settings/policies UI |
| 7 — Hardening / release candidate | PARTIALLY VERIFIED | Full automated regression green; 100-VU load test, hosted CI run and full manual a11y audit not executed (§5) |
| B — Attachments + accommodation gallery | COMPLETE / TESTED | MinIO-backed attachment upload/download with `attachments.*` permissions; gallery API `/api/v1/accommodation/gallery`, per-dormitory cover + per-room-type photos, management gallery UI |
| UI/UX redesign (crew + management) | COMPLETE / VERIFIED | All 34 routes redesigned and tracked in `docs/UI_UX_REDESIGN.md`; functional E2E 27/27 and responsive audit 12/12 green |
| C — Occupancy calendar + crew schedule | COMPLETE / TESTED | `/api/v1/calendar` with per-day occupancy, arrivals/departures and scope checks; `/manage/calendar` month grid/list; `/crew/schedule` month grouping; integration 2/2 |
| D — XLSX report export | COMPLETE / TESTED | `/api/v1/reports/export?format=xlsx` via `write-excel-file`; CSV and XLSX buttons on `/manage/reports`; XLSX signature asserted in integration and downloaded in browser |
| E–G — Security, accessibility, integrity | COMPLETE / VERIFIED with caveats | axe WCAG 2.1 A/AA clean on 28 routes + modal; Origin allow-list on unsafe methods; regression 28 unit / 46 integration; local p95 ≤ 77 ms (§5 notes residual limits) |
| H–J — CI, deployment profile, backup drill | IMPLEMENTED / DRILL EXECUTED | `.github/workflows/ci.yml`, `docker-compose.prod.yml` + nginx reverse proxy + runbook authored and syntax-validated; DB restore drill and MinIO restore drill executed; hosted CI and production deploy NOT executed |
| K–M — Demo consistency, final regression | COMPLETE / TESTED | Read-only data consistency checks clean (no orphan reservations/allocations/beds, no external gallery URLs); seeded roster provenance now labelled MOCK; full regression: typecheck, lint, build, 28 unit, 48 integration, 43 E2E |
| Brand identity, fullscreen login, sidebar toggle | COMPLETE / TESTED | New illustrated logo system and icons in `apps/web/public/brand/`; fullscreen railway login with centred card (no demo selector); desktop sidebar X replaced by persistent three-dot 276↔76 px toggle with tooltips and persistence; sidebar E2E 4/4, browser checks at 1440/390; full regression 28 unit / 51 integration / 48 E2E |
| Master Data, Users & Access, notification centre | COMPLETE / TESTED | `/manage/master-data` with category tabs, server-side search/filter/pagination, CRUD for room types/facilities/buildings/rooms/beds plus read-only organisation/crew views, and Excel export backed by `master-data` API routes; `/manage/users` with Pengguna, Role & Akses and Log Aktivitas tabs, role editor and bulk account-status change; header notification centre (bell only, no sidebar item). E2E `master-data-access.spec.ts` 5/5; axe clean |
| Management sidebar navigation redesign | COMPLETE / TESTED | `#8B1A1A` grouped sidebar (Utama, Reservasi, Operasional, Inventaris, Laporan, Pengelolaan Sistem + Akun) with permission filtering, Laporan submenu mapped to existing `ReportsPage` tabs, `aria-expanded`/`aria-controls` parents, ivory active children with `aria-current`, deep links and browser history, collapsed-rail flyouts (hover, keyboard, Escape) and mobile drawer. Collapsible group accordions (single-open, route-driven auto-open, 200 ms grid-rows animation, `inert` closed panels). E2E `sidebar-navigation.spec.ts` 8/8; all 20 management routes opened from the sidebar; zero overflow at 1920 and zoom-equivalent 720–3840 CSS px |
| Prepared external adapters (D-053) | IMPLEMENTED / INACTIVE | SMTP email + Telegram delivery providers with the existing MOCK path preserved when unconfigured; per-user Telegram chat binding (`users.telegram_chat_id`, `GET/PUT /auth/me/telegram`, audited) with a profile card; `HttpEmployeeProvider` (bearer/api-key/basic, strict mapping) behind `EMPLOYEE_SYNC_ENABLED=false`; `employeeSyncMode()` `DISABLED/MOCK/CONFIGURED`; production still refuses the sync flag. Unit 53/53, integration 116/116, full E2E 91/91 (12.7 min). No credentials added, no external message sent |
| Location master (D-047) | COMPLETE / TESTED | Additive `Location` model + `Dormitory.locationId`; 5 team-verified locations seeded idempotently (addresses NULL until verified); `locations.read`/`locations.manage` additive permissions; Master Data → Organisasi → Lokasi CRUD + export; integration 6/6, E2E 8/8 |
| Employee Excel import (D-048) | COMPLETE / TESTED | Template → preview (per-row zod + duplicate/conflict checks) → confirm → single-transaction commit with batch/row history and audit; `sourceSystem='IMPORT'` upsert by employee code; integration 5/5, E2E 2/2 |
| Accommodation Excel import (D-049) | COMPLETE / TESTED | Dormitories/buildings/rooms/beds import with parent-reference validation, no auto-invention; generic `ExcelImportPanel`; integration 6/6, E2E 2/2 |
| Zero-demo operational baseline (D-050) | COMPLETE / TESTED | `AUTH_MODE=password` + `SEED_DEMO=false`; secure `bootstrap-admin.ts` (one-time generated password, never overwrites); FK-safe transactional demo purge after verified backup + restore drill (origin gate; 12 demo users isolated DISABLED for append-only audit integrity; 361 MinIO objects removed); all demo displays gated to mock fixture env via `useIsDemoEnv()`; E2E separated onto `whoosh_stay_e2e` (4001/5175); KPI overflow fixed at 320–390; integration 17 files/98 tests, env unit 9/9, auth-password 8/8; live 15-page management sweep: true zeros, no demo text, no overflow |
| Finalization: credential rotation + zero-demo sweep + Phase 10/11 | COMPLETE / TESTED | Admin password rotated via `rotate-admin-password.ts` (secret stored outside repo, never printed); sweep re-run on current code: 57 matches all classified (mock-gated labels, no-op normalizers, identifiers, transparency badges, import-preview rows), 0 dummy/fake; Phase 10 full regression green (§3, 2026-11-22 latest run); Phase 11 reports: `docs/REAL_DATA_IMPORT_REPORT.md`, `docs/ZERO_DEMO_UI_AUDIT.md`, `docs/FULL_STACK_INTEGRATION_REPORT.md`, `docs/FINAL_REGRESSION_REPORT.md` + updated `docs/DATA_READINESS.md` |
| Synthetic employees (S1–S5) | COMPLETE / TESTED | 60 idempotent transactional SYNTHETIC profiles (WS-EMP-0001+, 5 home stations, 30 org references all UNCONFIRMED, example.invalid emails, no NIK/personal contacts, **0 login accounts**); UI warning badges + permanent notice; Excel import rejects SYNTHETIC codes; FK-safe `employees:purge-synthetic`; verified live through the real API; `docs/SYNTHETIC_EMPLOYEE_REPORT.md` |
| Accommodation research (R1–R7) | COMPLETE / TESTED | Additive 3-table research layer (`accommodation_research`/`research_sources`/`research_events`, migration `20261122120000`) reusing Location/Dormitory/User — no duplicate masters; 36 candidates + 65 sources imported idempotently (29 VERIFIED_PUBLIC / 7 RESEARCH_CANDIDATE / **0 VERIFIED_OFFICIAL_KCIC**, all PENDING, 0 promoted); `/api/v1/research*` with additive `research.read`/`research.manage` (manage = SYSTEM_ADMIN only); `/manage/research` review UI (detail, sources, compare ≤4, approve/reject, classification, promote disabled unless B+APPROVED); server-side promotion creates property-level Dormitory only — zero fabricated hierarchy; `research.test.ts` 6/6; `docs/ACCOMMODATION_RESEARCH_REPORT.md` |
| Management IA consolidation + dev demo dataset | COMPLETE / TESTED | Sidebar now ends Pengelolaan Sistem at "Pengguna & Hak Akses": Log Audit, Pengaturan and Data Karyawan entries removed; settings rendered as a permission-gated tab inside `/manage/users` (`SettingsPanel embedded`), audit tab already lived there; master data → Karyawan → Data Karyawan embeds the employees experience (sub-tab hidden without `employees.read`); `/manage/audit` and `/manage/settings` keep redirects under their old permission guards; `/manage/employees` stays as a deep-link route. Dev-only dataset via `demo:seed`: 5 `DEMO-DORM-*` dormitories (30 rooms/150 beds), 160 synthetic MinIO photos, 15 `DEMO-ACC-RSV-*` reservations across all statuses, 1 CREW demo login with random password in `.secrets`; production/test/e2e databases refused, dry-run default. Browser sweep: 24 management + 11 crew routes green; `docs/DATA_READINESS.md` §2c |

---

## 2. Delivered scope

### Crew portal (React)

| Capability | Route | Status |
|---|---|---|
| Home with next stay, active stay, history counts, notifications | `/crew` | TESTED (E2E) |
| Availability search from real allocations | `/crew/search` | TESTED (E2E + integration) |
| Dormitory detail with rooms/beds, cover photo, interior gallery + lightbox, per-date availability | `/crew/dormitories/:id` | TESTED (E2E gallery lightbox + page load) |
| Booking form with server-priced availability and optional bed choice | `/crew/book` | TESTED (E2E create) |
| Reservations list, detail, QR display, cancellation | `/crew/reservations`, `/crew/reservations/:id` | TESTED (E2E + integration) |
| Monthly stay schedule with upcoming/ongoing filters | `/crew/schedule` | TESTED (page load; calendar API tested) |
| Stay history | `/crew/history` | TESTED (E2E page load) |
| Check-in info + QR, check-out info | `/crew/check-in`, `/crew/check-out` | TESTED (E2E page load; QR lifecycle in integration) |
| Notifications inbox, profile, help | `/crew/notifications`, `/crew/profile`, `/crew/help` | TESTED (E2E) |

Desktop navigation includes the secondary menu ("Lainnya") so profile/history/help/check-out are reachable at all widths.

### Management portal (React)

Grouped sidebar: Utama, Reservasi, Operasional, Inventaris, Laporan, Pengelolaan Sistem, plus an Akun block (profile and logout) at the bottom. All items are real pages with live API data; the tree is built from the signed-in user's permissions, empty groups disappear, and direct URLs remain guarded by the server. Sidebar colour is exactly `#8B1A1A` with white labels/icons, muted uppercase group headings and divider rules. The Laporan parent is a submenu whose children open the existing report tabs via `?tab=` (reservations/occupancy/operational); parents expose a rotating chevron and `aria-expanded`/`aria-controls`, active children use `aria-current="page"` on an ivory surface with maroon text, and browser history/deep links are preserved. A persistent three-dot toggle collapses the desktop sidebar to a 76 px icon rail (276 px expanded) with tooltips, keyboard access, persisted preference and keyboard-dismissable flyouts that keep submenu children reachable; mobile keeps the slide-in drawer, which closes after navigation.

| Capability | Route | Status |
|---|---|---|
| Operational dashboard (arrivals/departures, pending approvals, readiness, mini-stats) | `/manage/dashboard` | TESTED (E2E) |
| Reservation management, approval/rejection, bed allocation UI | `/manage/reservations` | TESTED (integration + page load) |
| Real-time availability by dormitory/date | `/manage/availability` | TESTED (page load; API tested) |
| Occupancy calendar: month grid/list, per-day occupancy, arrivals/departures, day detail | `/manage/calendar` | TESTED (page load; calendar API tested) |
| Front desk: QR validation, check-in, active stays, check-out | `/manage/front-desk` | TESTED (integration + page load) |
| Dormitory/building/floor/room/bed tree, status changes, blocks | `/manage/inventory` | TESTED (page load; API exercised by tests) |
| Accommodation photo gallery: cover + per-room-type photos, upload/reorder/delete | `/manage/gallery` | TESTED (E2E + integration; DB-backed, `photos.manage`) |
| Housekeeping tasks, checklist, start/complete/verify | `/manage/housekeeping` | TESTED (integration + page load) |
| Maintenance tickets, inventory blocking, resolve/close | `/manage/maintenance` | TESTED (integration + page load) |
| Duty roster assignments, preview and sync | `/manage/roster` | TESTED (integration + page load) |
| Reservation/occupancy/operational reports + CSV/XLSX export | `/manage/reports` | TESTED (integration + page load; XLSX download verified in browser) |
| Users & Access: Pengguna (filters, bulk status), Role & Akses (permission matrix), Log Aktivitas (URL-driven tab/filters), Pengaturan sistem (merged settings tab) | `/manage/users` | TESTED (E2E) |
| Master Data: category tabs, search/filter/pagination, CRUD for room types, facilities, buildings, rooms, beds; read-only organisation/crew; Excel export | `/manage/master-data` | TESTED (E2E + axe + responsive) |
| Header notification centre: unread count, grouped items, mark read, deep-link navigation (no sidebar menu) | Header bell | TESTED (E2E) |
| Employee mirror, sync history | Master Data → Karyawan → Data Karyawan (embedded; `/manage/employees` deep link) | TESTED (E2E) |
| Audit log | `/manage/users?tab=audit` (old `/manage/audit` redirects) | TESTED (E2E redirect + tab content) |
| Notification delivery log (MOCK) | `/manage/notification-deliveries` | TESTED (integration + page load) |
| Settings + approval policies (D-008 surfaced as pending) | `/manage/settings` | TESTED (integration + page load) |

### Brand identity and login (React)

| Capability | Asset / route | Status |
|---|---|---|
| Illustrated bed + rail brand symbol and horizontal lockups | `/brand/whoosh-stay-symbol.svg`, `/brand/whoosh-stay-logo.svg`, `/brand/whoosh-stay-logo-on-dark.svg`, `/brand/whoosh-stay-logo.png` | TESTED (browser render at 32/64/128/512 px and in sidebar header) |
| Favicon and PWA icons | `/brand/favicon.svg`, `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `maskable-512.png` | TESTED (brand E2E metadata + manifest assertions) |
| Fullscreen login with generated railway photo and centred card | `/login` → `/photos/login-railway-1792.webp`, `/photos/login-railway-1024.webp` | TESTED (browser: centred card, password toggle, validation/error, crew/admin redirect, 390/360 no overflow) |
| Password auth, OIDC mode, session/cookie, RBAC and redirects | unchanged `/api/v1/auth/*` | TESTED (auth E2E + integration; no auth code changed) |

The login photo is generated demo imagery, not an official KCIC photograph. Demo accounts are not listed on the login page.

### Backend

Express 5 + Prisma + PostgreSQL 16. Route modules: auth, admin, audit, availability, calendar, dashboard, employees (incl. Excel import), health, housekeeping, inventory, maintenance, master-data (incl. Excel import/export), accommodation (gallery/photos), notifications, reports, research, reservations, roster, settings, stays. Deny-by-default `requirePermission` on every business route; scope predicates applied in lists, details and exports.

Database invariants (verified by `npm run db:verify` and integration tests):
- `bed_allocations_no_overlap` EXCLUDE constraint → PostgreSQL `23P01` mapped to HTTP `409 BED_ALLOCATION_CONFLICT`.
- Check-out is exclusive (`[check_in, check_out)`), so adjacent stays are legal (tested).
- `audit_logs` is append-only (trigger rejects UPDATE with `42501`).
- Partial unique indexes for role assignments, reservation idempotency, and one active QR per occupant.

### Operational data (dev) and synthetic fixtures (test/e2e only)

The dev database was purged of all demo operational data on 2026-11-22 (D-050) and later repopulated with an explicitly labelled dev-only demo dataset on user request (2026-11-22, see `docs/DATA_READINESS.md` §2c): 5 `DEMO-DORM-*` dormitories (30 rooms / 150 beds), 160 synthetic demo photos in MinIO, 15 `DEMO-ACC-RSV-*` reservations spanning CHECKED_OUT/CHECKED_IN/CONFIRMED/PENDING_APPROVAL/CANCELLED, a `DEMO` crew employee, and one CREW login (`crew.demo@demo.whoosh-stay.local`, random password only in `.secrets`). Every row carries `DEMO` codes and "(data uji)" names/captions; `demo:seed` refuses production and non-`whoosh_stay` databases, and `purge:demo` removes the dataset. The verified base remains: 5 locations, 8 roles / 63 permissions / 214 grants, system settings, 1 bootstrap admin (password rotated), 12 isolated DISABLED demo accounts (credential-less, role-less, kept only for append-only audit integrity) and preserved audit history (1,114+ rows).

Three explicitly labelled **non-operational** layers exist (see `docs/DATA_READINESS.md` §2b–§2c): 60 SYNTHETIC test employees (no login accounts, import-firewalled, purge CLI ready), 36 accommodation research candidates + 65 sources (all PENDING, 0 promoted; promotion requires official KCIC evidence + administrator approval, enforced server-side), and the dev demo accommodation dataset above. None is presented as KCIC operational data; the demo dataset is removable before operational go-live.

The synthetic fixture (5 dormitories, 30 rooms, 150 beds, 110 employees, 12 demo users, 200 reservations, 50 roster assignments, etc.) is seeded **only** into the isolated `whoosh_stay_test` and `whoosh_stay_e2e` databases by the test global setup. All fixture personal data is fictional; accounts use `@demo.whoosh-stay.local`. See `docs/DATA_READINESS.md` for the per-category readiness report.

---

## 3. Verification log (actual results, 2026-11-22)

**Latest integration-adapter batch (2026-11-22, D-053):** typecheck exit 0 · lint exit 0 · production build exit 0 · unit **53/53** (7 files) · integration **116/116** (21 files) · full Playwright suite **91/91 (12.7 min, exit 0)** on the isolated fixture · design audit unchanged at 129 (all waived) · `db:verify` passed (50 tables, 12 migrations). No real email/Telegram message was sent and no external credentials were added.

**Previous full regression (2026-11-22, after the collapsible-sidebar batch + unified design-review QC batch):** typecheck exit 0 · lint exit 0 · E2E 90/90 (13.0 min) · Hallmark audit 158 → 129 findings, remaining all waived brand-pattern/copy/semantic groups · visual check login + dashboard at 1440×900 and 360 px with 0 horizontal overflow. That run predates the D-053 `profile-telegram` spec; the new latest run above supersedes its E2E total. Full record: `docs/FINAL_REGRESSION_REPORT.md`.

| Check | Command | Actual result |
|---|---|---|
| TypeScript | `npm run typecheck` | exit 0 — shared, API, web |
| Lint | `npm run lint` | exit 0 — no findings |
| Production build | `npm run build` | exit 0 — shared, API, web (latest build after D-053: main chunk 430.18 kB / gzip 130.72 kB after route code splitting) |
| Unit tests | `npm run test:unit` | 7 files / **53 tests passed** (env 16, schemas 6, seed 7, auth types 8, SMTP 4, Telegram 5, HTTP employee 7) |
| Integration tests | `npm run test:integration` | 21 files / **116 tests passed** against real `whoosh_stay_test` (latest D-053 run; includes auth-telegram binding plus the existing research/master-data/import/employee suites) |
| Final E2E suite | `npm run test:e2e` | **91/91 passed (12.7 min, exit 0, 2026-11-22)** on the isolated `whoosh_stay_e2e` fixture — auth 5, a11y 4, brand 3, crew 3, employee-import 2, gallery 2, management 4, master-data-access 8, master-import 2, profile-telegram 1, rbac 2, responsive-audit 34, responsive 9, sidebar-navigation 8, sidebar 4. The management axe test has a 120 s per-test timeout (18 fresh axe analyses exceed the 45 s default); assertions unchanged |
| Sidebar navigation E2E | `npx playwright test tests/e2e/sidebar-navigation.spec.ts` | 8/8 passed — collapsible group accordions with `aria-expanded`/`aria-controls`, route-driven auto-open of the active category, submenu toggle, ivory active child + `aria-current`, report-tab back/forward, deep links, collapsed flyout via hover/focus + Escape, mobile drawer, RBAC visibility (housekeeping, dormitory manager) with server `403`s, all 20 management routes open with an active item, zero overflow at 720–3840 CSS px |
| Master data & access E2E | `npx playwright test tests/e2e/master-data-access.spec.ts` | 8/8 passed — category/sub-category tabs, search/filter/pagination URL state, duplicate-code validation, Excel export filename, user bulk dialog, role permission inspector, audit filter, header notification centre |
| Core Web Vitals (local) | Temporary harness (removed after measurement), production `dist` via `vite preview`, measurement-only API instance | Chromium headless, 1440×900, 4× CPU slowdown, no network throttling, two runs against the purged dev DB. LCP: login 240–268 ms, `/manage/dashboard` 516–560 ms, `/manage/reports?tab=occupancy` 492–556 ms, `/manage/master-data` 468–484 ms. CLS: 0 / 0.0004 / **0.0323 (worst, reports — improved from 0.092)** / 0.0081. Slowest event-timing entry 16 ms across 33–50 report-tab interaction events. Targets LCP ≤ 2500 ms, CLS ≤ 0.1, INP-proxy ≤ 200 ms met; honest caveat: minimal data volume post-purge; **not** a field or 100-VU measurement |
| Brand/login/sidebar E2E | `npx playwright test tests/e2e/brand.spec.ts tests/e2e/auth.spec.ts tests/e2e/sidebar.spec.ts` | 12/12 passed — logo metadata/lockups, password auth, collapse/expand, tooltips, persistence, flyouts, mobile drawer, reduced motion |
| Accessibility | `npx playwright test tests/e2e/a11y.spec.ts` | **4/4 passed** — axe WCAG 2.1 A/AA clean on login, 11 crew routes, 18 management routes (including Master Data) and an open modal; keyboard focus trap/Escape/focus restore verified |
| E2E functional subset | `npx playwright test tests/e2e/auth.spec.ts tests/e2e/brand.spec.ts tests/e2e/crew.spec.ts tests/e2e/gallery.spec.ts tests/e2e/management.spec.ts tests/e2e/rbac.spec.ts tests/e2e/responsive.spec.ts` | included in the 91/91 full-suite run (auth, brand, crew, gallery, management, RBAC, responsive all green) |
| Migrations | `prisma migrate status` | 12 migrations applied; "Database schema is up to date!" |
| DB verification | `npm run db:verify` | PASS — 50 tables, btree_gist, exclusion constraint, append-only audit, partial unique indexes, 12 migrations, seed (roles=8, permissions=63, users=14 — includes the dev demo crew login) |
| Responsive | `tests/e2e/responsive-audit.spec.ts` | 11 crew + 18 management routes at 360/390/768/1024/1280/1440 — 34/34 passed, zero unfixed viewport offenders |
| Calendar integration | `npx dotenv -e ../../.env.test -- npx vitest run --config vitest.integration.config.ts test/integration/calendar.test.ts` | 2/2 passed (per-day invariants, 90-day rejection, SELF denial) |
| Reports XLSX | `... vitest run ... test/integration/operations.test.ts` | 7/7 passed — XLSX content-type, `.xlsx` filename, `PK` signature |
| Reports export UI | Playwright download check + screenshots | CSV and XLSX buttons download; layout reviewed at 1280 and 390 |
| Local latency | Node fetch harness, 20 sequential samples/endpoint, admin session | p95: health 6 ms, auth/me 22 ms, dashboard overview 41 ms, operations 60 ms, reservations 72 ms, availability 77 ms, calendar 60 ms, reports 25–41 ms, CSV export 44 ms, notifications 27 ms, employees 22 ms, gallery 66 ms. Single-user local run, **not** a 100-VU load test |
| Brand sidebar | Playwright computed style | `rgb(139, 26, 26)` = `#8B1A1A` |
| Restore drill (database) | `infrastructure/scripts/pg-backup.sh` then `pg-restore-drill.sh` | PASS — backup 297,444 bytes (`PGDMP`); restore into throw-away DB: 41/41 tables, 832/832 combined rows (`reservations`+`audit_logs`+`beds`), 1/1 exclusion constraint + trigger, 3/3 migrations; `UPDATE audit_logs` rejected; drill DB dropped |
| Restore drill (objects) | `infrastructure/scripts/minio-backup.sh` then temporary-bucket restore | PASS — 700 assets files / 33 MiB and 8 evidence files mirrored to host; temporary bucket restore matched 700 objects / 33 MiB; temporary bucket removed |
| Deployment config | `docker compose -f docker-compose.prod.yml --env-file … config --quiet` | exit 0 (production Compose valid with `production.env.example` values) |
| CI workflow syntax | YAML parse of `.github/workflows/ci.yml` | parsed; single job `build-and-test` — **not run on a hosted runner** |
| API health | `GET http://localhost:4000/health/live` | 200 (also used as Playwright webServer probe) |
| Web | `http://localhost:5174` | served by Playwright webServer; E2E green |

Integration coverage includes: grouped availability; full lifecycle create → approve → QR → validate → check-in → active stay → check-out → allocation `RELEASED` → housekeeping task created; idempotent replay; duplicate QR rejection (`QR_ALREADY_USED`); two concurrent bookings for the same bed (exactly one `201`, one `409` with `BED_ALLOCATION_CONFLICT`, single `HELD` row); rejection cancelling held allocations; cross-crew `403`; housekeeping start/complete/verify with separated permissions; maintenance blocking + resolution; roster preview/sync idempotency and permission denial; report scope denial for SELF users; CSV and XLSX export; per-day calendar occupancy/arrival/departure invariants and range validation; blocked unsafe-method requests from an unapproved Origin; settings persistence with D-008 pending; notification read actions; delivery log restricted to notification admins.

---

## 4. Fixes made during this execution

| Defect | Fix |
|---|---|
| Maintenance ticket resolution returned 500 when the inventory block was future-dated | Future blocks are deleted; only in-progress blocks are clamped to `now` (avoids violating `inventory_blocks_dates_check`) |
| Crew could read all reservations/occupancy via `/reports/*` because SELF scope mapped to an empty predicate | `assertReportAccess` rejects SELF-only principals with `403` on all report handlers and export |
| Report CSV export returned 500 (non-UUID `entityId` written to an UUID audit column) | Audit write no longer sets `entityId` for string report identifiers |
| Roster preview/sync returned 500 (`Employee.status` does not exist) | Queries use `employmentStatus` |
| Crew secondary navigation unreachable on desktop | Added "Lainnya" dropdown; labels collapse below `lg` to avoid overflow |
| Integration test cleanup left mock roster rows, making reruns non-idempotent | Cleanup covers the full two-day roster window |
| Lifecycle test validated a bed outside the front-desk account's dormitory scope | Lifecycle pinned to `DEMO-DORM-01` |
| Master Data row action exposed visible "Nonaktif" while its accessible name was "Nonaktifkan …" (`label-content-name-mismatch`, serious) | Visible action label is now "Nonaktifkan"; axe WCAG 2.1 A/AA scan of `/manage/master-data` clean |
| `/manage/users` filter row overflowed the 360/390 viewport | Filter controls wrap (`flex-wrap`); responsive audit includes Master Data and passes 12/12 |

No authorization guard, database constraint, or failing test was weakened to obtain a green result.

---

## 5. Incomplete, mocked, or not verified

| Item | Category | Detail |
|---|---|---|
| Official OIDC issuer/client | MOCK / BLOCKED BY STAKEHOLDER | Adapter implemented; demo auth only in development; production refuses mock. No real issuer credentials were invented |
| KCIC-owned accommodation evidence | BLOCKED BY STAKEHOLDER | Research found 0 official KCIC sources for crew accommodation at any of the 5 locations; 0 classification-B records, 0 promotions. Code DEPO-501 is unconfirmed publicly (likely Depo Tegalluar area). Per-location data requests drafted in `docs/ACCOMMODATION_RESEARCH_REPORT.md` §3; promotion stays locked until official evidence + administrator approval |
| Employee and roster synchronization | MOCKED | `EMPLOYEE_SYNC_ENABLED=false`, `ROSTER_SYNC_ENABLED=false`; providers labelled `MOCK_*`; no external call is claimed |
| Email / Telegram notifications | MOCKED | In-app creation is real; external channel rows are recorded as `MOCK_DELIVERED`/`QUEUED`; nothing leaves the system |
| MinIO attachments | IMPLEMENTED / TESTED | Attachments module streams uploads/downloads through the API with `attachments.*` permissions; no storage credentials or unrestricted URLs are exposed to the browser. Demo gallery photos are served through the API |
| Schedule/calendar view | IMPLEMENTED / TESTED | `/manage/calendar` (month grid + list, per-day occupancy, arrivals/departures, day detail) and `/crew/schedule` (month grouping, upcoming/ongoing) backed by `/api/v1/calendar`; integration 2/2 |
| Reports | PARTIAL | Three families (reservations, occupancy, operational) with CSV and XLSX export. PDF export and the remaining report families from the SRS are not implemented |
| Gender/rooming policy | NOT IMPLEMENTED | Pending stakeholder decision; rooms default to `UNSPECIFIED`; no sensitive employee attribute added |
| D-008 readiness window | PENDING DECISION | `availability.readinessWindowHours` is configurable (default 0) and the settings UI marks D-008 as pending. The proposed 24 h value is **not** hardcoded |
| Performance / load targets | PARTIALLY VERIFIED | Local sequential p95 ≤ 77 ms on measured endpoints (20 samples each, single user); measured Core Web Vitals on the production build with 4× CPU slowdown are inside budget (worst LCP 1360 ms, worst CLS 0.092 on `/manage/reports`, slowest interaction 24 ms). CLS 0.092 leaves little margin under the 0.1 limit. No k6/100-VU baseline; SRS p95 targets under concurrency remain unproven |
| Accessibility audit | PARTIALLY VERIFIED | Automated axe WCAG 2.1 A/AA scans clean on login, 11 crew routes, 18 management routes and an open modal; modal focus trap/Escape/focus restore tested; no full manual keyboard walkthrough |
| CSRF token | NOT IMPLEMENTED | Mitigated by `SameSite=Lax` session cookies and an Origin allow-list check on unsafe methods; a dedicated CSRF token would be required if the API is embedded cross-site |
| API Content Security Policy | DOCUMENTED LIMITATION | Helmet CSP is disabled on the JSON API (Swagger UI is dev-only); browser CSP belongs to the static web host, which is not implemented yet |
| Production deployment profile | IMPLEMENTED / NOT EXECUTED | `docker-compose.prod.yml`, API/web Dockerfiles, nginx reverse proxy and `docs/DEPLOYMENT_RUNBOOK.md`; Compose config validates. A real deploy is blocked by the missing official OIDC issuer and TLS edge; nothing was deployed or load-tested |
| Backup/restore drill | TESTED (isolated) | Database drill restored 41 tables / 832 rows / 3 migrations with constraints and append-only trigger intact; MinIO drill restored 700 objects / 33 MiB into a temporary bucket. Both drill artifacts were removed; live data untouched. No scheduled backups, PITR, off-site retention or encryption were implemented |
| Rate-limit scaling | DOCUMENTED LIMITATION | In-memory limiter suitable for a single instance; shared store required before horizontal scaling |
| CI pipeline | IMPLEMENTED / NOT EXECUTED | `.github/workflows/ci.yml` covers typecheck, lint, unit, integration, seeded E2E and build. The workspace has no git remote or hosted runner, so the workflow was only syntax-validated |

---

## 6. Commands

```bash
# install
npm install

# infrastructure (PostgreSQL 5433, MinIO 9110/9111)
docker compose up -d

# database (development)
npm run db:migrate
npm run db:seed
npm run db:verify

# development
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:5174

# verification
npm run typecheck
npm run lint
npm run build
npm run test:unit
npm run test:integration
npm run test:e2e    # requires: npx playwright install chromium

# optional mock employee sync
npm run employees:sync

# labelled synthetic test employees (non-operational; idempotent seed / FK-safe purge)
npm run employees:seed-synthetic
npm run employees:purge-synthetic

# accommodation research candidates (idempotent; never overwrites admin decisions)
npm run research:import

# dev-only labelled demo accommodation dataset (dry-run by default; refuses prod/test/e2e)
npm run demo:seed -w @whoosh/api -- --confirm
# remove it (rows + MinIO objects) before operational go-live
npm run purge:demo -w @whoosh/api

# admin credential rotation (prints the new secret exactly once; store it outside the repo)
npm run rotate:admin -w @whoosh/api

# backup and restore drill (isolated database; live data untouched)
infrastructure/scripts/pg-backup.sh ./backups
infrastructure/scripts/pg-restore-drill.sh ./backups/<dump-file>
infrastructure/scripts/minio-backup.sh ./backups

# production profile (requires a filled infrastructure/docker/production.env)
docker compose --env-file infrastructure/docker/production.env -f docker-compose.prod.yml config
```

Environment template: [`.env.example`](.env.example). Production template: [`infrastructure/docker/production.env.example`](infrastructure/docker/production.env.example). Deployment, backup and rollback procedures: [`docs/DEPLOYMENT_RUNBOOK.md`](docs/DEPLOYMENT_RUNBOOK.md). Integration tests require `DATABASE_URL` pointing at a database whose name contains `whoosh_stay_test`; the global setup migrates and seeds it automatically.

Authentication (development): `AUTH_MODE=password`. Sign in with email + password via `POST /api/v1/auth/login` (scrypt hashes, generic 401, SUSPENDED/DISABLED 403, failed-login audit). The first administrator is created with `apps/api/src/database/bootstrap-admin.ts` (min 12-char or generated one-time password; rejects the demo email domain; never overwrites an existing user; GLOBAL SYSTEM_ADMIN + audit). Dev admin: `admin@whoosh-stay.local` — its generated password was displayed exactly once at bootstrap and must be rotated by the operator; bootstrap your own email for real use. The former 12 demo accounts (`@demo.whoosh-stay.local`) are **isolated DISABLED** (null credential hashes, no roles, no sessions) and cannot log in; they remain visible in Users & Access only for audit traceability. `dev-login`/demo selectors exist only when `AUTH_MODE=mock` outside production (the isolated test fixture environment). Production (`AUTH_MODE=oidc`, `SEED_DEMO=false`) never creates demo hashes and refuses mock authentication.

---

## 7. Next actions

1. Stakeholder decisions still open: D-008 readiness window, rooming policy, notification providers, OIDC/employee/roster contracts, retention; final disposal of the 12 isolated DISABLED demo accounts after audit review.
2. **Populate real data (zero-demo policy):** provide legitimate sources — verified HR/employee export, facility master (dormitories/buildings/rooms/beds), real accommodation photos, location addresses — then run the built import paths (D-048/049) or master-data forms. Nothing is fabricated until sources exist; the dev demo accommodation dataset (§2c) is labelled test data and must be removed with `purge:demo` before go-live. See `docs/DATA_READINESS.md`.
3. **Answer the research data requests:** send the per-location KCIC question lists in `docs/ACCOMMODATION_RESEARCH_REPORT.md` §3 through official channels — starting with the meaning of code DEPO-501 and whether crew rest buildings exist at Depo Tegalluar. Only official evidence can unlock classification B → administrator approval → promotion into the operational master.
4. Operator security: bootstrap your own admin email via `bootstrap-admin.ts`, rotate the one-time generated dev password, set a strong `SESSION_SECRET`, and supply the official OIDC issuer/client/secret before production. Connect real providers only after official contracts and credentials are supplied; mock adapters stay honestly labelled until then.
5. Before production: run the CI workflow on a hosted runner; terminate TLS at an edge; add scheduled off-site backups, a shared rate-limit store, monitoring and a 100-VU load test; complete the manual keyboard/a11y walkthrough.
