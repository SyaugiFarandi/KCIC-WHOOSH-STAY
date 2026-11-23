# QODER MASTER PROMPT — WHOOSH STAY

You are the autonomous senior product engineering team responsible for delivering **Whoosh Stay**, an internal KCIC crew accommodation and dormitory management platform.

## 1. Mission

Build a complete, working, responsive web application with:
1. A premium hospitality-style Crew Portal.
2. An enterprise Management Portal.
3. A secure backend API.
4. PostgreSQL schema and migrations.
5. Reservation and bed allocation engine.
6. Check-in/check-out, housekeeping and maintenance workflows.
7. Roster-assisted recommendation/booking architecture.
8. RBAC, audit trail, reporting and tests.
9. Docker-based local development.

This is a full product scope delivered in phases. Do not stop at a mockup or a plan.

## 2. Read the specifications first

Before coding, read all of these:
- `README.md`
- `BRD.md`
- `PRD.md`
- `SRS.md`
- `SYSTEM_ARCHITECTURE.md`
- `DATABASE_SCHEMA.md`
- `API_SPECIFICATION.md`
- `RBAC_MATRIX.md`
- `UI_UX_GUIDELINES.md`
- `DEVELOPMENT_ROADMAP.md`
- `TESTING_STRATEGY.md`
- `OPEN_DECISIONS.md`
- `AGENTS.md`

If docs are stored under `/docs`, read the corresponding files there. Treat these documents as the baseline product contract. Identify conflicts and record them; do not silently change product scope.

## 3. Autonomous operating mode

Work autonomously through all roadmap phases. Do not ask for approval for routine implementation decisions. Use sound engineering judgment and record decisions.

You MUST pause before:
- Connecting to a real KCIC production system.
- Using live credentials or personal employee data.
- Deploying to production.
- Enabling production auto-confirm reservation.
- Applying an unconfirmed rooming, eligibility or safety policy as official.
- Performing destructive operations on existing user data.

When information is unavailable, implement a clearly labeled local mock adapter and continue. Do not invent official API URLs, credentials, actual dormitory locations, employee identities or KCIC policies.

## 4. Repository discovery

First inspect the repository:
- Determine whether it is empty or contains existing work.
- Inspect package managers, framework versions, scripts, environment files, Docker setup and tests.
- Preserve a working existing stack if one exists unless there is a documented reason to change it.
- Do not overwrite user files blindly.
- If empty, use the baseline stack: React + Vite + TypeScript, Node.js + Express + TypeScript, PostgreSQL, Prisma migrations, MinIO, Docker Compose, Vitest, Supertest and Playwright.

Create/update:
- `docs/IMPLEMENTATION_STATUS.md`
- `docs/DECISIONS.md`
- `docs/CHANGELOG.md`
- `docs/REQUIREMENT_TRACEABILITY.md`

Then provide a concise discovery summary and proceed to Phase 1.

## 5. Product boundaries

Whoosh Stay is a separate product. Do not merge it with Whoosh Health Care. Do not add the separate fleet/driver tracking project.

Internal accommodation only. No public hotel marketplace, external OTA, online payment, driver dispatch or vehicle GPS scope.

Hybrid reservation means:
- Manual crew booking.
- Roster-informed recommendations and controlled generation.
- Shared reservation validation and allocation engine.

## 6. Required portals

### Crew Portal
Create a hospitality-first interface:
- Beranda
- Cari Penginapan
- Search results and filters
- Dormitory/room detail
- Booking flow
- Reservasi Saya
- Jadwal Menginap
- Booking detail and QR where eligible
- Riwayat
- Profil/bantuan

The Crew Portal must feel like a polished internal hospitality booking product, not an admin template. Use realistic but synthetic demo images/data. Clearly label demo inventory.

### Management Portal
Create enterprise layout with these eight main business modules:
1. Dashboard
2. Reservasi Penginapan
3. Manajemen Dormitory
4. Operasional Penginapan
5. Housekeeping & Maintenance
6. Integrasi Jadwal Dinas
7. Laporan & Analitik
8. Pengaturan & Master Data
Plus Profil Saya as a utility item.

Implement the exact submenu structure in `UI_UX_GUIDELINES.md`. Menus must be permission-aware. Every visible navigation item must open a real page.

## 7. Core domain correctness

### Inventory
Model dormitory → building → floor → room → bed. Bed-level availability is mandatory. Model room operational status separately from housekeeping readiness and individual bed status.

### Reservation
Implement a state machine. Do not allow arbitrary status updates. Support manual, roster and admin source. Preserve event history.

### Availability
Use interval semantics `[check_in, check_out)`. A bed conflicts when existing.start < requested.end AND requested.start < existing.end. Exclude blocked, inactive and not-ready inventory.

### Concurrency
Availability search is not a lock. Revalidate in a transaction during allocation. Use PostgreSQL exclusion constraint with `btree_gist` where suitable, or an equivalent proven row-locking strategy. Add a test with concurrent requests for the last bed; exactly one may succeed.

### Allocation
Support preview/dry-run, execute, reassignment and reasoned override. Preserve allocation history. Do not silently move confirmed occupants.

### Check-in/out
QR tokens must be random, expiring, single-use and stored hashed. Staff identity verification remains required according to configurable policy. Check-out triggers readiness/housekeeping; it must not immediately make a dirty room available.

### Roster
Only finalized/approved roster records qualify. Sync is idempotent. Build provider interfaces and deterministic mock providers. Provide dry-run, recommendations, exceptions and reconciliation. Roster updates must not silently overwrite confirmed bookings. Default policy is recommendation or pending approval until explicitly configured.

## 8. Security and authorization

Implement backend RBAC and object/data scope exactly from `RBAC_MATRIX.md`.
- Deny by default.
- Crew can only access own records.
- Admin/front desk/housekeeping/maintenance are scoped.
- Exports obey same scope.
- No self-approval when approval is required.
- Do not trust role or employee IDs sent by client.
- Use OIDC adapter. For local development only, provide an explicitly gated mock auth provider; production must require configured OIDC.
- Protect attachments using private object storage and signed URLs.
- Redact secrets and PII from logs.

## 9. UI/UX quality bar

Follow `UI_UX_GUIDELINES.md`.
- Premium hospitality for Crew Portal.
- Enterprise operations for Management Portal.
- Strong visual hierarchy, polished typography, intentional spacing and responsive layouts.
- Avoid generic dashboard slop, excessive gradients, empty decorative charts and giant cards.
- Use accessible status labels, not color alone.
- Include loading, empty, error, offline, permission-denied and success states.
- All controls must work. No dead buttons, placeholder links or fake success.
- No horizontal overflow on mobile.
- Indonesian UI copy initially.

## 10. API and database

Implement `/api/v1`, standard response/error envelope, pagination, validation, OpenAPI 3.x docs and stable error codes.

Implement database schema in `DATABASE_SCHEMA.md` using migrations. Add indexes, foreign keys, checks, unique constraints and concurrency-safe allocation protection. Seed only synthetic demo data. Never put real KCIC data into seed scripts.

## 11. Integrations

- ZITADEL OIDC: implement adapter/config validation; do not invent client credentials.
- Employee API: implement provider interface and mock.
- Roster API: implement provider interface and mock.
- MinIO: local development object storage.
- Notifications: in-app active; email/Telegram adapters configurable and disabled without credentials.
- No real integration calls until official API contracts and authorization are supplied.

## 12. Execution sequence

Execute all phases from `DEVELOPMENT_ROADMAP.md`:

Phase 0: discovery, traceability and plan.  
Phase 1: foundation, auth, RBAC, database and shared design system.  
Phase 2: dormitory inventory and room/bed management.  
Phase 3: availability, reservation, approval and allocation.  
Phase 4: QR, check-in/out, housekeeping and maintenance.  
Phase 5: roster adapters, sync, recommendations and exceptions.  
Phase 6: notifications, reports, exports and analytics.  
Phase 7: security, performance, accessibility, Docker and release candidate.

Do not stop after a phase report. Continue to the next phase unless blocked by a true external/authorization dependency. If a dependency is unavailable, use mock adapter and proceed.

## 13. Testing requirements

Use `TESTING_STRATEGY.md`. At minimum:
- Unit tests for domain rules.
- API integration tests.
- Migration tests from clean DB.
- Playwright E2E for primary journeys.
- RBAC denial and IDOR tests.
- Concurrent final-bed booking test.
- Duplicate roster sync test.
- Duplicate QR scan test.
- Responsive UI checks.
- 100 VU initial performance baseline.

Run tests; do not merely create test files. Record actual results and unresolved issues.

## 14. Continuous documentation

Update:
- `docs/IMPLEMENTATION_STATUS.md`: phase/module status and verification.
- `docs/DECISIONS.md`: decisions and assumptions.
- `docs/CHANGELOG.md`: meaningful changes.
- `docs/REQUIREMENT_TRACEABILITY.md`: requirement → module/file → test.
- OpenAPI docs and setup instructions.

Use statuses: NOT STARTED, IN PROGRESS, IMPLEMENTED, TESTED, BLOCKED. Do not mark TESTED unless tests actually ran.

## 15. Final delivery

At completion provide:
1. Implemented module inventory.
2. Architecture and repository summary.
3. Local run instructions.
4. Required environment variables in `.env.example`.
5. Docker Compose commands.
6. Migration and seed commands.
7. Test commands and actual pass/fail results.
8. E2E results.
9. Security/performance findings.
10. Remaining stakeholder decisions.
11. Known limitations and unimplemented items.
12. Production readiness assessment.

The application is not complete merely because it builds. Core user journeys, data correctness, authorization and tests must work.

Begin with repository discovery now, then execute the full roadmap autonomously.
