# Whoosh Stay — Decision Log

**Date opened:** 2026-11-21
**Format:** per `OPEN_DECISIONS.md` §4. Status: Accepted = implemented as architecture default; Proposed = requires KCIC stakeholder approval before production behavior.

---

## D-001 — Repository layout and documentation consolidation

- **Date:** 2026-11-21
- **Decision:** The outer workspace directory is the repository root. Application code lives in `apps/api`, `apps/web`, `packages/shared`; documentation consolidates into root `/docs`.
- **Context:** The delivered pack is duplicated at root and in a nested package folder.
- **Options:** (a) Keep nested duplicate sources, (b) consolidate to one `/docs`.
- **Consequences:** Single source of truth; explicit move step in Phase 1; no deletion of user files without confirmation.
- **Approver/source:** Lead Architect; `README.md`, `SYSTEM_ARCHITECTURE.md`.
- **Status:** Accepted.

## D-002 — Technology baseline

- **Date:** 2026-11-21
- **Decision:** React + Vite + TypeScript, Express 5 + TypeScript, PostgreSQL 16, Prisma with migrations, MinIO, npm workspaces, Vitest/Supertest/Playwright, Docker Compose; exact versions pinned at scaffold.
- **Context:** Baseline stack specified; environment has Node 24, npm 11, Docker, no pnpm, no existing code.
- **Options:** (a) Baseline stack, (b) alternate ORM/runtime without justification.
- **Consequences:** npm workspaces replace pnpm; Express 5 async model; version pinning verified by smoke tests.
- **Approver/source:** `README.md`; environment discovery.
- **Status:** Accepted.

## D-003 — Modular monolith with facades

- **Date:** 2026-11-21
- **Decision:** One deployable API organized by domain modules with public facades; no microservices; business rules server-side only.
- **Context:** Initial product scale does not justify distributed systems; boundaries still required.
- **Options:** (a) Modular monolith, (b) microservices, (c) unstructured monolith.
- **Consequences:** Enforced import boundaries; single transaction boundary for booking/allocation; future extraction possible.
- **Approver/source:** `SYSTEM_ARCHITECTURE.md`, `AGENTS.md`.
- **Status:** Accepted.

## D-004 — Authentication and session strategy

- **Date:** 2026-11-21
- **Decision:** OIDC Authorization Code + PKCE through an `IdentityProvider` adapter; backend-issued opaque session in HttpOnly Secure SameSite=Lax cookie backed by a `sessions` table; dev mock provider gated by `AUTH_MODE=mock` and refused in production; no tokens in localStorage.
- **Context:** SRS requires OIDC production auth, logout/expiry, and no fabricated ZITADEL config.
- **Options:** (a) Opaque server sessions, (b) JWT in memory/localStorage, (c) client-only OIDC.
- **Consequences:** Revocable sessions, simple logout; session table added; CSRF mitigated with `SameSite=Lax` cookies plus an Origin allow-list check on unsafe methods (no separate CSRF token; residual risk documented in `IMPLEMENTATION_STATUS.md` §5).
- **Approver/source:** `SRS.md` FR-AUTH, `SYSTEM_ARCHITECTURE.md` §7.
- **Status:** Accepted (OIDC configuration still required for production).

## D-005 — RBAC enforcement and permission catalog alignment

- **Date:** 2026-11-21
- **Decision:** Every route declares a permission and scope; central permission middleware plus scope-to-query resolver; deny by default verified by a route-registry test. Add `reservations.create_for_others`, `settings.manage`, `attachments.upload`, `attachments.read`. Use `reports.read` instead of the undocumented `reports.occupancy.read`.
- **Context:** API and permission catalog disagreed; admin booking-for-others and several admin surfaces lacked permissions.
- **Options:** (a) Align to catalog with minimal additions, (b) create parallel permission sets.
- **Consequences:** Exports reuse scope predicates; object-level guards required per entity; no client-trusted roles/scopes.
- **Approver/source:** `RBAC_MATRIX.md`, `API_SPECIFICATION.md`.
- **Status:** Accepted.

## D-006 — Schema amendments

- **Date:** 2026-11-21
- **Decision:** Add `beds.housekeeping_status` and `beds.status_reason`; add `sessions` and `system_settings`; add partial unique active QR index and entity indexes; keep room-level readiness as an aggregate gate.
- **Context:** Bed-level dirtiness is required but only rooms had readiness; session and runtime settings were undocumented.
- **Options:** (a) Derive bed readiness from tasks only, (b) explicit bed status.
- **Consequences:** Explicit, query-efficient readiness; room DIRTY/not-ready blocks all its beds; no employee gender field added yet.
- **Approver/source:** `SRS.md` FR-HK/FR-AVAIL, `DATABASE_SCHEMA.md`.
- **Status:** Accepted (schema deviations recorded for migration).

## D-007 — Bed allocation concurrency protection

- **Date:** 2026-11-21
- **Decision:** PostgreSQL `btree_gist` exclusion constraint on `(bed_id, daterange(stay_start, stay_end, '[)'))` for `HELD`/`ACTIVE` allocations, plus deterministic row locks and serialization retries in the transaction; raw SQL migration; `prisma db push` prohibited.
- **Context:** Prisma cannot declare GiST exclusion constraints; search is not a lock.
- **Options:** (a) Exclusion constraint plus locks, (b) application-only checks, (c) serializable isolation alone.
- **Consequences:** Database-level guarantee; `23P01` maps to 409 `BED_ALLOCATION_CONFLICT`; migration test must assert constraint presence.
- **Approver/source:** `QODER_MASTER_PROMPT.md` §7, `DATABASE_SCHEMA.md` §5.
- **Status:** Accepted.

## D-008 — Readiness policy for future-dated bookings

- **Date:** 2026-11-21
- **Decision:** Maintenance blocks and non-operational inventory always exclude availability. Bed readiness is enforced for stays starting within a configurable window (proposed 24 hours) and rechecked at check-in; outside the window transient dirtiness does not block future booking. Overrides require explicit permission and reason.
- **Context:** Housekeeping status is instantaneous; a DIRTY bed today may be ready weeks before a future stay.
- **Options:** (a) Enforce readiness for all dates, (b) enforce only near-term with check-in recheck, (c) never enforce until arrival.
- **Consequences:** Prevents both blocked future inventory and dirty-room arrivals; window value requires operational approval.
- **Approver/source:** Derived from `SRS.md` FR-AVAIL-003/FR-STAY-003; **requires KCIC confirmation**.
- **Status:** Proposed — stakeholder approval required.

## D-009 — Inventory block date normalization

- **Date:** 2026-11-21
- **Decision:** Store blocks as timestamptz; evaluate them against date-only stays using conservative Asia/Jakarta date coverage: first blocked date is the local date of `start_at`, last blocked date is the local date of `end_at - 1s`, inclusive.
- **Context:** Stays are date-only while blocks are timestamped.
- **Options:** (a) Convert to JKT dates conservatively, (b) compare timestamps to midnight UTC, (c) change blocks to dates.
- **Consequences:** No unblocked partial days; documented boundary tests; display remains Asia/Jakarta.
- **Approver/source:** `DATABASE_SCHEMA.md`, `SRS.md` §4.
- **Status:** Accepted (implementation rule).

## D-010 — Group stay aggregate semantics

- **Date:** 2026-11-21
- **Decision:** Per-guest truth in `reservation_guests`, `checkin_records`, `checkout_records`; reservation becomes `CHECKED_IN` on the first guest check-in and `CHECKED_OUT` only when all guests have checked out; allocation history retained per guest.
- **Context:** Reservation-level state model did not define partial group arrival/departure.
- **Options:** (a) Reservation-only check-in, (b) per-guest with aggregate status.
- **Consequences:** Partial arrivals supported; transition tests must cover mixed guest states.
- **Approver/source:** `SRS.md` FR-RES-012, FR-STAY.
- **Status:** Accepted (implementation default; operational policy to confirm).

## D-011 — Roster automation safe defaults

- **Date:** 2026-11-21
- **Decision:** Sync processes finalized/approved records only; upsert keyed by `(source_system, external_roster_id)`; payload hash; advisory lock per source; default mode `RECOMMENDATION_ONLY`/approval-required; auto-confirm and live sync disabled by flags; confirmed bookings are never mutated.
- **Context:** Policy for automatic booking is unconfirmed; duplicate sync would create duplicate demand.
- **Options:** (a) Auto-confirm by default, (b) recommendation/approval by default.
- **Consequences:** Safe pilot behavior; conversion permission-gated; enabling automation requires approval.
- **Approver/source:** `OPEN_DECISIONS.md`, `BRD.md` §7.
- **Status:** Accepted safe default; auto-confirm proposed only.

## D-012 — QR credential policy

- **Date:** 2026-11-21
- **Decision:** 32-byte random token, only SHA-256 hash stored, configurable TTL (proposed: valid from issuance until check-out date end, max 7 days), single-use consumed transactionally; one active token per reservation+employee with rotation; validate returns a 2-minute signed validation token; confirm consumes; rate-limited; raw token never logged or returned in lists.
- **Context:** QR must be random, expiring, single-use, hashed; spec left issuance/eligibility endpoints unspecified.
- **Options:** (a) Signed stateless QR, (b) opaque random token with hash storage.
- **Consequences:** Replay-resistant; rotation supported; TTL and eligibility window need operational confirmation.
- **Approver/source:** `SRS.md` FR-STAY-002, `QODER_MASTER_PROMPT.md` §7.
- **Status:** Accepted architecture; TTL/window Proposed.

## D-013 — Jobs, retries and realtime

- **Date:** 2026-11-21
- **Decision:** In-process worker with DB-backed delivery/run logs and a periodic sweeper; no Redis or Socket.IO in v1; UI polls/refetches after mutations; notification failure never rolls back bookings.
- **Context:** Queue infrastructure is optional and not justified at current scale; realtime is P2.
- **Options:** (a) In-process + DB, (b) Redis/BullMQ, (c) Socket.IO realtime.
- **Consequences:** Simpler deployment; restart-safe through idempotent operations; revisit shared queue before horizontal scaling.
- **Approver/source:** `SYSTEM_ARCHITECTURE.md` §9, roadmap P2.
- **Status:** Accepted.

## D-014 — Additive API surface

- **Date:** 2026-11-21
- **Decision:** Add auth flow routes, `/my/summary`, `/my/schedule`, QR issuance/eligibility, admin users/role assignment, scoped `/employees`, notification center routes, admin settings, attachments with signed URLs, remaining report exports, and health endpoints.
- **Context:** Documented UI and permissions require endpoints not listed in the API spec.
- **Options:** (a) Extend API additively, (b) omit UI capabilities.
- **Consequences:** OpenAPI includes extensions; backward compatibility preserved for specified routes.
- **Approver/source:** `API_SPECIFICATION.md`, `PRD.md` modules.
- **Status:** Accepted.

## D-015 — OpenAPI from Zod schemas

- **Date:** 2026-11-21
- **Decision:** Zod DTOs are the single contract source; generate OpenAPI 3.1; contract test verifies routes match spec; Swagger UI dev-only.
- **Context:** Hand-maintained specs drift from implementation.
- **Options:** (a) Generate from code, (b) hand-written YAML with contract tests.
- **Consequences:** Reduced drift; shared client validation uses the same schemas.
- **Approver/source:** `API_SPECIFICATION.md` §14.
- **Status:** Accepted.

## D-016 — Demo data and assets

- **Date:** 2026-11-21
- **Decision:** All seeded inventory and people are synthetic and marked DEMO in names/codes and UI; no real KCIC locations, employees or PII; dormitory/room imagery is generated or clearly licensed for demo use.
- **Context:** No fabrication policy; screenshots need realistic but synthetic content.
- **Options:** (a) Synthetic fixtures, (b) placeholder gray boxes.
- **Consequences:** Realistic demos without policy risk; production seeds replaced by imports later.
- **Approver/source:** `AGENTS.md`, `OPEN_DECISIONS.md` §3.
- **Status:** Accepted.

## D-017 — One dormitory per reservation

- **Date:** 2026-11-21
- **Decision:** `reservations.dormitory_id` remains single-valued; group bookings across dormitories are deferred.
- **Context:** Schema models one dormitory per reservation; requirements do not mandate cross-dormitory groups.
- **Options:** (a) Single dormitory, (b) multi-dormitory allocation model now.
- **Consequences:** Simpler allocation and policy; documented limitation; revisit if stakeholders require.
- **Approver/source:** `DATABASE_SCHEMA.md`.
- **Status:** Accepted (limitation).

## D-018 — Export implementation and safety

- **Date:** 2026-11-21
- **Decision:** `exceljs` for XLSX and `pdfkit` for PDF; exports reuse list filters and scope; sanitize formula-leading cells; cap synchronous exports at 50,000 rows with a clear error; log export actions in audit.
- **Context:** SRS requires XLSX/PDF, scope enforcement and formula-injection protection.
- **Options:** (a) Client-side CSV only, (b) server-generated XLSX/PDF with scope.
- **Consequences:** No client-only exports; large exports deferred to async job if needed.
- **Approver/source:** `SRS.md` FR-REPORT.
- **Status:** Accepted.

## D-019 — Timezone and date semantics

- **Date:** 2026-11-21
- **Decision:** Persist timestamptz in UTC; business dates are date-only; operational boundaries, display and block normalization use Asia/Jakarta; API accepts/returns `YYYY-MM-DD` for stay dates.
- **Context:** Mixed date/timestamp fields create off-by-one risk; no DST in Jakarta.
- **Options:** (a) JKT business dates with UTC storage, (b) UTC dates everywhere.
- **Consequences:** Consistent boundaries; tests at 00:00/23:59 JKT.
- **Approver/source:** `DATABASE_SCHEMA.md`, `SRS.md` §5.
- **Status:** Accepted.

## D-020 — Audit immutability

- **Date:** 2026-11-21
- **Decision:** Audit rows are written inside critical transactions; a database trigger blocks UPDATE/DELETE; no application endpoints mutate audits; sensitive fields redacted; scoped read endpoint only.
- **Context:** Audit must be append-only with actor/entity/time/request ID.
- **Options:** (a) Trigger plus service discipline, (b) service discipline only.
- **Consequences:** Stronger tamper resistance; test cleanup uses truncation, not deletion.
- **Approver/source:** `SRS.md` FR-AUDIT, `DATABASE_SCHEMA.md` §9.
- **Status:** Accepted.

## D-021 — Approval workflow default

- **Date:** 2026-11-21
- **Decision:** Single-step approval by default when policy requires approval; requester cannot approve; approval steps schema retained for future multi-step policies; rejection and cancellation require reason; every decision recorded in events and audit.
- **Context:** Approval hierarchy is unconfirmed; a safe default is required.
- **Options:** (a) No approval, (b) single-step configurable approval.
- **Consequences:** Crew bookings pending by default; admin direct confirmation only with permission; thresholds remain stakeholder-owned.
- **Approver/source:** `SRS.md` FR-RES-004, `RBAC_MATRIX.md` §6.
- **Status:** Accepted safe default; hierarchy Proposed.

## D-022 — Feature flags and startup guards

- **Date:** 2026-11-21
- **Decision:** Integration toggles live in validated environment configuration plus non-secret `system_settings`; production startup fails when mock auth is selected, when OIDC is missing but required, or when unsafe automation flags are enabled without explicit approval.
- **Context:** Mock adapters must never silently reach production.
- **Options:** (a) Env-only flags, (b) env plus runtime settings.
- **Consequences:** Misconfiguration is fail-fast; admin UI shows integration status.
- **Approver/source:** `AGENTS.md`, `SRS.md` NFR.
- **Status:** Accepted.

## D-023 — Front desk scanning approach

- **Date:** 2026-11-21
- **Decision:** Support keyboard-wedge scanners (input focus) and paste/manual token entry in v1; browser camera capture is an optional enhancement; staff identity verification remains a recorded action according to policy.
- **Context:** Hardware/scanner policy is unconfirmed; camera adds complexity and device permissions.
- **Options:** (a) Keyboard-wedge plus manual, (b) camera-first, (c) QR image upload.
- **Consequences:** Works with common desk scanners and desktops; no camera dependency; identity verification not bypassed.
- **Approver/source:** `PRD.md` Journey C, `OPEN_DECISIONS.md` items 10–11.
- **Status:** Accepted; verification policy Proposed.

## D-024 — Crew history placement

- **Date:** 2026-11-21
- **Decision:** "Riwayat" is a tab within Reservasi Saya; "Jadwal Menginap" remains a separate schedule page; no duplicate history route in primary navigation.
- **Context:** PRD lists Riwayat in crew surfaces; UI guidelines navigation omits it.
- **Options:** (a) Separate nav item, (b) tab within reservations.
- **Consequences:** Cleaner crew nav; history remains discoverable; route `/reservations?tab=history`.
- **Approver/source:** `PRD.md` §2.1 vs `UI_UX_GUIDELINES.md` §4.
- **Status:** Accepted.

## D-025 — Pinned versions, isolated ports and local topology

- **Date:** 2026-11-21
- **Decision:** Use npm workspaces with TypeScript 6, Express 5.3, Prisma 6.19, React 19.3, Vite 8.3, Tailwind 4.3, TanStack Query 5.108, Vitest 5.1, openid-client 6.9, Playwright 1.65. Local ports are isolated from other projects: API 4000, web 5174, PostgreSQL 5433, MinIO 9110 (API) / 9111 (console); integration tests run in-process via Supertest against database `whoosh_stay_test` (`.env.test` reserves port 4100), and Playwright runs against the isolated fixture database `whoosh_stay_e2e` with API 4001 and web 5175 (`.env.e2e`). A conflicted port is never killed; another port is chosen (MinIO was moved from 9100/9101 to 9110/9111 after another project claimed the loopback binding).
- **Context:** Multiple projects share the workstation; no pnpm is installed; ports 5432/9000/5173/3000 are commonly occupied.
- **Consequences:** Repeatable local setup; test data isolated from development data; Playwright never touches the development database.
- **Approver/source:** User constraint (do not affect other projects); `README.md` baseline.
- **Status:** Accepted.

## D-026 — MinIO developer image substitution

- **Date:** 2026-11-21
- **Decision:** Use `bitnamilegacy/minio:latest` for local object storage because the official `minio/minio` image could not be pulled in this environment. Keep the same S3-compatible server/client binaries, root credentials, health semantics and private bucket initialization.
- **Context:** Docker Hub access to the official image failed; MinIO is only needed for later-attachment phases.
- **Consequences:** Local development unblocked; production deployment must select a supported, pinned MinIO image and review licensing. No application contract depends on the image vendor.
- **Approver/source:** Environment constraint; `SYSTEM_ARCHITECTURE.md`.
- **Status:** Accepted for development only.

## D-027 — ESM workspace and shared build ordering

- **Date:** 2026-11-21
- **Decision:** All workspaces are ESM (`"type": "module"`) with `NodeNext` resolution. `@whoosh/shared` is consumed from `dist`, so `build:shared` must run before API/web typecheck/build and before starting either app from a clean checkout.
- **Context:** Runtime imports of shared Zod contracts and labels must work identically in Node and Vite.
- **Consequences:** Root scripts enforce shared-first order; `.js` extensions are required in relative TS imports. Vite consumes the built ESM package.
- **Approver/source:** Implementation evidence (TS6059/ESM failures during scaffold).
- **Status:** Accepted.

## D-028 — OpenAPI generation in Zod v4

- **Date:** 2026-11-21
- **Decision:** Register paths and DTO shapes explicitly with `@asteasolutions/zod-to-openapi` `registerPath`; do not rely on `.openapi()` metadata, which is absent from the shared Zod v4 schemas. Zod validators remain the single runtime contract source.
- **Context:** The selected zod-to-openapi release does not expose Zod v4 metadata registration for every shared schema.
- **Consequences:** OpenAPI is generated and served, but summary/description detail is authored in the registry. Revisit when first-class Zod v4 metadata is supported; add a route/OpenAPI contract test in a later hardening phase.
- **Approver/source:** `API_SPECIFICATION.md` §14; dependency behavior.
- **Status:** Accepted (temporary).

## D-029 — User status vocabulary and admin safety guards

- **Date:** 2026-11-21
- **Decision:** Normalize `users.status` to `ACTIVE | SUSPENDED | DISABLED` (migration `20261121050000_user_status_alignment`). Reject role changes on self, and reject removing the final `SYSTEM_ADMIN` assignment. `SYSTEM_ADMIN` assignments must be `GLOBAL`; `DORMITORY`/`BUILDING` assignments require a unit id; duplicate assignments are rejected.
- **Context:** The initial schema and RBAC seed used an inconsistent status value; admin UI needed server-enforced validation.
- **Consequences:** Suspension is explicit and audited; lockout and privilege-escalation paths are blocked server-side. Status changes and role updates write audit entries.
- **Approver/source:** `RBAC_MATRIX.md`; `DATABASE_SCHEMA.md`; security requirement SEC-1/SEC-3.
- **Status:** Accepted.

## D-030 — Reservation source test fixtures

- **Date:** 2026-11-21
- **Decision:** `reservations.source` is constrained to `CREW | MANAGEMENT | ROSTER`. Tests that need a reservation create it with `CREW`; no migration or constraint is relaxed to admit test-only values.
- **Context:** An integration fixture used `TEST`, which violated `reservations_source_check`.
- **Consequences:** Database validation remains authoritative; fixtures reflect a real source.
- **Approver/source:** `DATABASE_SCHEMA.md`; constraint-first policy.
- **Status:** Accepted.

## D-031 — Test database lifecycle and browser requirement

- **Date:** 2026-11-21
- **Decision:** Integration tests require `DATABASE_URL` pointing at `whoosh_stay_test`; a guard aborts otherwise. The global setup runs `prisma migrate deploy` and the seed once per run. Playwright owns server startup (API 4000, web 5174) and reuses running servers. Chromium must be installed once with `npx playwright install chromium`.
- **Context:** Tests must never reset or seed the development database; browser binaries are not installed by npm.
- **Consequences:** Repeatable CI-style runs; a fresh machine needs the explicit browser install step. Unit tests need no database.
- **Approver/source:** `IMPLEMENTATION_PLAN.md` P1-11; environment constraints.
- **Status:** Accepted.

## D-032 — Frontend role-aware landing after login

- **Date:** 2026-11-21
- **Decision:** After authentication, redirect by role as well as by the original route: non-management users requesting `/manage/*` land on `/crew`; management users requesting `/crew*` land on `/manage/dashboard`; `PortalLanding` routes by `isManagementUser`.
- **Context:** A post-logout redirect state pointing at `/manage/*` sent crew users into a `403` page after demo login.
- **Consequences:** No cross-portal dead ends; server authorization remains the final authority.
- **Approver/source:** Implementation bug found during E2E verification.
- **Status:** Accepted.

## D-033 — Canonical documentation location during Phase 1

- **Date:** 2026-11-21
- **Decision:** Root `IMPLEMENTATION_STATUS.md` remains canonical through Phase 1; `docs/IMPLEMENTATION_STATUS.md` is a pointer. The nested delivered package is preserved unchanged. Consolidating the remaining duplicated specs into `/docs` is deferred until explicitly authorized because it requires moving/deleting user-provided files.
- **Context:** D-001 calls for consolidation, but the user instruction requires preserving all existing documentation.
- **Consequences:** No documentation is lost; one canonical status file is maintained. Consolidation can be performed later as a reviewed move.
- **Approver/source:** User preservation constraint; D-001.
- **Status:** Accepted (temporary).

## D-034 — Readiness window is configurable and D-008 stays pending

- **Date:** 2026-11-21
- **Decision:** `availability.readinessWindowHours` is read from system settings on every search. Missing or non-positive values mean readiness is enforced only for same-day/overdue check-ins. The proposed 24-hour window is **not** hardcoded; the settings UI labels it as pending decision D-008.
- **Context:** The master prompt requires D-008 to remain configurable and not be treated as approved.
- **Consequences:** Operations can tune readiness behavior without a deployment; stakeholder approval is still required before a production default is chosen.
- **Approver/source:** Master prompt constraint; D-008.
- **Status:** Accepted (configuration); policy value PENDING.

## D-035 — Reports deny SELF-only principals

- **Date:** 2026-11-21
- **Decision:** `/reports/reservations`, `/reports/occupancy`, `/reports/operational` and `/reports/export` reject principals whose scope is only `SELF` with `403 FORBIDDEN`. Reporting is a management capability; crew users receive their own summary via `/my/summary` and their reservation list.
- **Context:** The shared scope helper maps `selfOnly` to an empty Prisma predicate for row-level filtering, which would have returned global aggregates in report queries.
- **Consequences:** No aggregate leakage to crew accounts; the explicit denial is covered by integration and E2E tests.
- **Approver/source:** Security finding during Phase 6 implementation.
- **Status:** Accepted.

## D-036 — Maintenance block release semantics

- **Date:** 2026-11-21
- **Decision:** When a maintenance ticket moves to `RESOLVED`/`CLOSED`, inventory blocks that have not started are deleted; blocks already in progress have `endAt` clamped to the current time. Resolving a ticket does not change room readiness.
- **Context:** Clamping a future block to `now` produced `startAt >= endAt`, violating `inventory_blocks_dates_check` and returning HTTP 500.
- **Consequences:** Availability is freed immediately without fabricating past block intervals; housekeeping verification remains a separate step.
- **Approver/source:** Integration test failure; database constraint.
- **Status:** Accepted.

## D-037 — External integrations remain mock and explicitly labelled

- **Date:** 2026-11-21
- **Decision:** Employee sync, roster sync, email and Telegram delivery remain development adapters. `EMPLOYEE_SYNC_ENABLED=false` and `ROSTER_SYNC_ENABLED=false` by default; roster rows use `MOCK_ROSTER`; delivery records use `QUEUED`/`MOCK_DELIVERED`; UI surfaces "MOCK". No external network call is made or claimed.
- **Context:** No official KCIC contracts or credentials exist; inventing them is prohibited.
- **Consequences:** Core manual workflows remain fully functional; automation can be enabled only after contracts, credentials and validation are supplied.
- **Approver/source:** Master prompt constraints; R-09.
- **Status:** Accepted.

## D-038 — Scope boundary for attachments, calendar and exports

- **Date:** 2026-11-21
- **Decision:** This execution does not implement MinIO-backed attachments, dedicated schedule/calendar pages, XLSX/PDF exports, performance load tests, production deployment profile or backup drills. MinIO infrastructure and environment variables remain available for a later phase; CSV export and date-filtered reservation lists are provided instead.
- **Context:** These items were not part of the implemented vertical slices and no mock should be presented as a finished feature.
- **Consequences:** The gaps are listed in `IMPLEMENTATION_STATUS.md` §5 and must be scheduled before production acceptance.
- **Approver/source:** Implementation boundary; master prompt "no fabricated results".
- **Status:** Superseded by D-039 (attachments, calendar and XLSX export were subsequently implemented).

## D-039 — Scope update: attachments, calendar and XLSX export delivered

- **Date:** 2026-11-21
- **Decision:** MinIO-backed attachments, the accommodation photo gallery, dedicated occupancy calendar (`/manage/calendar`), crew stay schedule (`/crew/schedule`) and XLSX report export are implemented and tested. XLSX is generated server-side with `write-excel-file` (replacing the uninstalled `exceljs`, whose dependency tree pulled a vulnerable `uuid`). PDF export and the remaining SRS report families stay out of scope; performance targets, the production deployment profile and the backup/restore drill remain open items in `IMPLEMENTATION_STATUS.md` §5 until executed and recorded.
- **Context:** D-038 was written before Phases B–D; leaving it unchanged would misstate the delivered scope, while claiming PDF or load testing without evidence would violate the no-fabrication rule.
- **Consequences:** CSV, XLSX and calendar routes are covered by integration tests and browser verification. PDF, performance, deployment and backup items must still be scheduled before production acceptance.
- **Approver/source:** Implementation progress; master prompt Phase C/D requirements and "no fabricated results".
- **Status:** Accepted.

## D-040 — CI, production profile and backup drill boundary

- **Date:** 2026-11-21
- **Decision:** CI is delivered as `.github/workflows/ci.yml` (typecheck, lint, unit, integration, seeded E2E, build) and the production profile as `docker-compose.prod.yml` with API/web Dockerfiles, an nginx reverse proxy and `docs/DEPLOYMENT_RUNBOOK.md`. Backup/restore is evidenced by executed isolated drills: the database restored 41/41 tables, 832/832 combined rows and 3/3 migrations with the exclusion constraint and append-only audit trigger intact; MinIO restored 700 objects / 33 MiB into a temporary bucket. Scheduled backups, point-in-time recovery, off-site retention, monitoring, TLS termination and a hosted CI run remain out of scope and are recorded as open in `IMPLEMENTATION_STATUS.md` §5.
- **Context:** The workspace is not a git repository and no production OIDC issuer, TLS edge or hosted runner exists, so deploying or claiming a green CI run would be fabricated. Restoring over the live demo database would violate the no-destructive-testing constraint.
- **Consequences:** Deployment files are syntax-validated only; production start-up remains blocked by the official OIDC contract. Drills used throw-away databases and buckets which were removed afterwards, leaving `whoosh_stay`, `whoosh_stay_test` and the real buckets untouched.
- **Approver/source:** Master prompt Phases H–J; no-fabrication and no-destructive-testing constraints.
- **Status:** Accepted.

## D-041 — Brand mark, fullscreen login and three-dot sidebar toggle

- **Date:** 2026-11-21
- **Decision:** The brand mark is a new illustrated lockup combining an ivory bed/headboard with a gold curved rail track and speed lines inside a maroon tile, not a letter-in-a-square. Canonical assets live in `apps/web/public/brand/`:

  | Asset | Purpose |
  |---|---|
  | `whoosh-stay-symbol.svg` | 64×64 maroon tile with bed + rail symbol |
  | `whoosh-stay-logo.svg` | Horizontal lockup, dark ink wordmark on light surfaces |
  | `whoosh-stay-logo-on-dark.svg` | Cream/gold lockup for maroon or photo surfaces |
  | `whoosh-stay-logo.png` | 600×152 raster export of the light lockup |
  | `favicon.svg` | Simplified symbol for 16–32 px favicon use |
  | `favicon-32.png`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `maskable-512.png` | Browser/PWA icons |
  | `whoosh-stay-primary-on-light.svg`, `whoosh-stay-primary-on-dark.svg`, `whoosh-stay-compact-on-light.svg`, `whoosh-stay-compact-on-dark.svg`, `whoosh-stay-login.svg`, `whoosh-stay-sidebar.svg` | Legacy filenames kept in sync with the same lockups so existing references do not break |

  `Logo.tsx` renders the vector symbol inline so the sidebar symbol and wordmark adapt to collapse state. The login page uses a fullscreen generated railway photograph (`/photos/login-railway-1792.webp` with a 1024 px variant) under a dark gradient, with a centred ivory card (max 420 px) containing the lockup, "Selamat Datang Kembali", username/password fields with a password visibility toggle, and a `#8B1A1A` "Masuk" button; the demo-account selector was removed and no demo credentials are listed. The image is synthetic demo imagery, not an official KCIC photograph. Motion (`animate-rise`) remains CSS-based and the existing `prefers-reduced-motion` rules disable it. Authentication, session, cookie, RBAC, redirection and audit behaviour are unchanged; OIDC production mode still replaces the password form with SSO and mock auth remains refused outside development.
  The desktop sidebar uses one persistent three-dot (`Ellipsis`) toggle in both states instead of an X: expanded 276 px with labels, collapsed 76 px rail with the brand symbol and icons, joined by a 260 ms width transition; tooltips "Ciutkan sidebar" / "Perbesar sidebar" follow hover and keyboard focus; the choice persists in `localStorage` (`whoosh:sidebar:management`); submenu flyouts, active indicators, `#8B1A1A` and RBAC are unchanged. The mobile slide-in drawer keeps its X inside the drawer.
- **Context:** The brief required a distinct illustrated identity and a cinematic login without touching other pages or backend auth, and a less destructive collapse affordance than an X.
- **Consequences:** No other page was redesigned and no API, schema, auth or workflow changed; the only incidental presentation edits were regression fixes for contrast (`CrewHomePage`) and responsive overflow (`DashboardPage`, `ManagementCalendarPage`). The generated hero photo must be replaced with licensed/official imagery before any public production launch if brand or licensing policy requires it.
- **Approver/source:** User brand/login and sidebar briefs; "ONLY REDESIGN THE BRAND LOGO AND LOGIN PAGE. PRESERVE EVERYTHING ELSE."
- **Status:** Accepted.

## D-042 — Notification deliveries: backend-only diagnostics, not a sidebar destination

- **Date:** 2026-11-21
- **Decision:** "Pengiriman Notifikasi" (`/manage/notification-deliveries`) is reclassified as a backend-only diagnostics surface. It is removed from the management sidebar but the route, its `notifications.manage` permission guard, and the notification service itself are all retained.

  | Surface | Before | After | Rationale |
  |---|---|---|---|
  | Management sidebar item | Visible to `notifications.manage` | Removed | Delivery logs are an admin diagnostic, not a daily operational destination; keeping it in the primary nav overloaded the "Pengelolaan Sistem" group. |
  | Route `/manage/notification-deliveries` | Registered | Registered (unchanged) | Deep links, E2E reachability and RBAC must keep working; removing the route would break existing tests and bookmarks. |
  | Permission `notifications.manage` | Enforced | Enforced (unchanged) | Server-side authorization is the security boundary; hiding a menu item is never an access control. |
  | Settings page entry | None | "Diagnostik Pengiriman Notifikasi" card with "Buka diagnostik" link, gated by `hasPermission('notifications.manage')` | Gives admins a discoverable, permission-aware path without a permanent sidebar slot. |
  | User notification centre | Header bell (`NotificationBell`) | Header bell (unchanged) | End users read their own notifications through the bell; the delivery log is a separate operator concern and must not be merged into it. |
  | Notification service / providers | Running | Running (unchanged) | Hiding a frontend menu must never stop backend delivery processing. |

- **Context:** The navigation brief required removing duplicate/low-value sidebar entries without deleting RBAC, routes, or backend behaviour, and without creating a second sidebar. The bell remains the single user-facing notification centre.
- **Consequences:** `sidebar-navigation.spec.ts` now asserts the item is absent from the sidebar while the route stays reachable, and that the Settings "Buka diagnostik" link is visible to admins. Hidden-list assertions for housekeeping/manager roles remain valid. No API, schema, permission, or notification-delivery code changed.
- **Approver/source:** User navigation-cleanup brief; "Hindari membuat sidebar kedua atau duplikasi menu", "Never rely on frontend filtering as a security mechanism", "backend services must keep running when frontend menus are hidden".
- **Status:** Accepted.

## D-043 — Additive analytics summary endpoints (scope-identical to module lists)

- **Date:** 2026-11-21
- **Decision:** Add four read-only aggregation endpoints so KPI cards and charts are computed from real database data instead of frontend pagination slices. Existing endpoints, contracts, RBAC, and business logic are unchanged; these routes are purely additive.

  | Endpoint | Guard | Payload |
  |---|---|---|
  | `GET /api/v1/housekeeping/summary` | `housekeeping.read` | `{ total, open, byStatus, byType, generatedAt }` |
  | `GET /api/v1/maintenance/summary` | `maintenance.read` | `{ total, open, byStatus, byPriority, generatedAt }` |
  | `GET /api/v1/reservations/summary` | `reservations.read` | `{ total, pendingApproval, byStatus, arrivingToday, departingToday, generatedAt }` |
  | `GET /api/v1/employees/summary` | `employees.read` | `{ total, byStatus, departments, positions, lastSyncedAt, generatedAt }` |

  Scope rule: each summary reuses exactly the same access-scope `where` builder as its module list (extracted into shared functions so list and summary cannot diverge). GLOBAL sees everything; dormitory/building scopes use `readableRoomWhere`/`readableReservationWhere`; housekeeping ASSIGNED_TASK/SELF counts only `assignedTo = user`; maintenance SELF counts `reportedBy = user`, ASSIGNED_TASK counts `assignedTo = user`; reservations SELF counts own/guest reservations. `arrivingToday`/`departingToday` count `checkInDate`/`checkOutDate` equal to today (Jakarta business date via todayDateOnly) excluding `CANCELLED`/`REJECTED`, within the caller's scope. Aggregation uses Prisma `count`/`groupBy` — never page-limited frontend data.
- **Context:** The analytics brief required KPI/charts from real DB data while forbidding changes to existing API contracts; the prior audit found dashboard/list KPIs were derived from single pages of paginated results.
- **Consequences:** Integration tests (`analytics-summary.test.ts`) assert summary totals equal the scoped list totals per role, breakdown sums equal totals, today counters equal direct DB counts, and crew accounts receive 403 on modules they cannot read. No existing route, schema, or permission changed.
- **Approver/source:** User security/integration/analytics brief (additive aggregation endpoints explicitly authorized); "Jangan mengubah API ... yang sudah lolos regression" interpreted as existing contracts unchanged.
- **Status:** Accepted.

## D-044 — Charts stay lightweight CSS visualizations (no chart library)

- **Date:** 2026-11-21
- **Decision:** Do not add recharts or any chart dependency. KPI strips use the existing `StatCard`; distributions and trends use the existing token-based CSS visualizations (dashboard trend bars, report occupancy bars, progressbars) fed by the new summary endpoints, with printed values and text labels so meaning never relies on color alone.
- **Context:** ui-ux-pro-max chart guidance requires legends/labels and accessible colors; the app already has consistent CSS chart patterns, and a chart library would add bundle weight against the Core Web Vitals targets without new capability for these simple distributions.
- **Consequences:** Zero new dependencies; charts remain readable at 50–200% zoom and on mobile; every bar/segment prints its numeric value. If future requirements need interactive time-series (tooltips, brushing), revisit this decision then.
- **Approver/source:** UI/UX brief ("Optimalkan React rendering", performance constraints) and prior performance brief ("Do not claim a performance target passed without actual measurement").
- **Status:** Accepted.

## D-045 — Additive `statuses` filter on GET /reservations (history mode)

- **Date:** 2026-11-21
- **Decision:** Add an optional, additive `statuses` query parameter (comma-separated, validated against `RESERVATION_STATUSES`) to `GET /api/v1/reservations`. When the existing single `status` parameter is present it wins and behavior is byte-identical to before; `statuses` only applies when `status` is absent. Invalid values are ignored (same lenient policy as `parseStatusFilter`). The crew history page (`mode="history"`) now requests `statuses=CHECKED_OUT,CANCELLED,REJECTED,NO_SHOW` by default and its status dropdown only offers terminal statuses, so the archive no longer shows active reservations.
- **Context:** Audit finding H3 — "Riwayat menginap" claimed to be an archive of finished/cancelled/rejected stays but never filtered terminal statuses. Server-side filtering keeps pagination totals correct; frontend filtering was rejected ("Never rely on frontend filtering as a security mechanism", correct totals).
- **Consequences:** Existing API consumers unaffected (parameter absent → identical queries). Scope enforcement unchanged (`reservationScopeWhere` still applied). Covered by integration tests.
- **Approver/source:** Master full-stack brief Phase 11.5 ("Jika perubahan UI membutuhkan perubahan backend, lakukan perubahan backend yang diperlukan") + additive-only interpretation of the API-preservation rule.
- **Status:** Accepted.

## D-046 — Hallmark installed as design reviewer; UI/UX Pro Max remains primary

- **Date:** 2026-11-21
- **Decision:** Install `nutlope/hallmark@hallmark` (v2.0.0, skills.sh identity verified, 117K+ installs) into `C:\Users\muhammad.farandi\.qoder\skills\hallmark` via the pinned `skills@1.5.22` client (`-g -a qoder`). Verified: skill appears in the live Qoder catalog, SKILL.md + references readable, `scripts/sloplint.mjs` inspected (static tier: pure local HTML/CSS parsing, writes only `.hallmark/`, no network/shell) and smoke-tested successfully. Render tier (`--render`) uses puppeteer-core + headless Chrome and is only run after that dependency is available.
- **Responsibility split (per master brief §1.3):**
  - **UI/UX Pro Max (primary):** design direction, tokens, palette, typography, spacing, components, layout, UX patterns, responsive, accessibility, forms, navigation, data visualization.
  - **Hallmark (review/QC only):** `audit` verb (report-only per `references/redesign.md` — "It changes none of the project's files"), sloplint findings, visual-hierarchy/whitespace/card-overuse/monotony critique, fresh-context finish review. Never used to deal themes or rebuild pages: WHOOSH STAY is an existing branded system.
- **Conflict resolution (per master brief §1.4):** WHOOSH STAY identity wins (sidebar #8B1A1A, brand tokens, Plus Jakarta Sans). Hallmark Floor rules that target marketing pages are waived on the record for this enterprise app: eyebrows/tracked-capital labels (gate 54/67 — established WHOOSH STAY pattern), ~80-word screen budget (58 — operational screens need density; Hallmark's own app-scope skips layout gates), hero-fold rules (44b — app screens have no hero), CSS stamp (20 — Tailwind v4 build, not hand-written CSS). Hallmark's own precedence agrees: "the Floor and the user's own words beat both". Genuine quality gates (contrast, focus-visible, reduced-motion, no invented metrics, no fake success, token-only colors) are adopted as review criteria — they match the existing audit checklist.
- **Context:** Master brief Phase 1 requires Hallmark as additional design reviewer without replacing UI/UX Pro Max or producing conflicting design systems.
- **Consequences:** Two-skill workflow: Pro Max establishes direction → Hallmark audits/critiques → Qoder implements approved fixes in the existing system → Playwright validates. No design tokens changed by Hallmark recommendations alone.
- **Approver/source:** Master full-stack brief Phases 1.2–1.5 (explicit install authorization for github.com/Nutlope/hallmark).
- **Status:** Accepted.

## D-047 — Location master (Phase 3): five verified operational locations, additive schema

- **Date:** 2026-11-21
- **Decision:** Add a `Location` model (`locations` table: unique `code`, `name`, optional `description`/`address`, `status`, timestamps, `createdBy`/`updatedBy`) and an optional `Dormitory.locationId` FK (`ON DELETE SET NULL`, indexed). Migration `20261121151004_location_master` is purely additive — no existing column, row, or constraint touched. Seed upserts the five team-provided locations by code (`HALIM`, `KARAWANG`, `PADALARANG`, `TEGALLUAR`, `DEPO-501`) with `update: {}` so re-seeding never overwrites operator edits. Addresses stay NULL ("Jangan membuat alamat berdasarkan asumsi"); no buildings/rooms/beds are invented for locations without lodging.
- **API:** `GET/POST /api/v1/master-data/locations`, `PATCH /api/v1/master-data/locations/:id` (new additive permissions `locations.read` / `locations.manage`; manage requires global scope, mirroring room-types). Duplicate code → 409; deactivation blocked while ACTIVE dormitories are linked → 409; every mutation audited (`LOCATION_CREATE`/`LOCATION_UPDATE`). Excel export entity `locations` (global scope). Dormitory create/update accept optional `locationId` (validated: must exist and be ACTIVE; null unlinks); summaries expose `locationId`/`locationName`.
- **RBAC (additive only):** `locations.read` granted to all 8 roles (non-sensitive reference data, same reach as `dormitories.read`); `locations.manage` to SYSTEM_ADMIN + DORMITORY_ADMIN (global-scope enforced at route). No existing grant removed or altered.
- **UI:** Master Data → Organisasi → "Lokasi" now lists the real location master (search, status filter, pagination, create/edit/deactivate, export). The former dormitory list moved to Akomodasi → "Unit Akomodasi" with a new Lokasi column; the dormitory editor gained a Lokasi link select. DEMO dormitories are deliberately NOT auto-linked to real locations (demo/operational separation, Phase 13).
- **Verification:** API+web typecheck EXIT=0, root ESLint EXIT=0; integration `test/integration/locations.test.ts` 6/6 (seed integrity, CRUD+audit, link guard, RBAC, export, plus the previously missing D-045 `statuses` filter test); `master-data-access` + `auth-rbac` integration 19/19; seed unit 7/7; Playwright `master-data-access.spec.ts` 8/8 including 3 new location tests. Browser-verified live: create → refresh persistence → dormitory link → unlink; scratch record removed, dev DB back to exactly 5 locations.
- **Approver/source:** Master full-stack brief Phase 3 (five master locations explicitly provided by the user's team).
- **Status:** Accepted.

## D-048 — Employee Excel import (Phase 5): preview → confirm → transactional commit, additive schema

- **Date:** 2026-11-21
- **Decision:** Add `EmployeeImportBatch` (`employee_import_batches`) and `EmployeeImportRow` (`employee_import_rows`, cascade on batch delete) models so a validated preview persists between upload and confirm and every import keeps a per-row error report. Migration `20261121153159_employee_import` is purely additive. Imported employees use `sourceSystem='IMPORT'` with `externalEmployeeId = employeeCode` (the existing `(sourceSystem, externalEmployeeId)` unique key), so re-imports update instead of duplicating; `eligibilityStatus` stays `UNKNOWN` on create and untouched on update (eligibility is a business decision, not import data). No NIK/phone columns exist or are invented; empty optional cells stay NULL.
- **Contract (packages/shared):** `EMPLOYEE_IMPORT_COLUMNS` (employeeCode, fullName, employmentStatus, workEmail, departmentCode, departmentName, positionCode, positionName, homeStationCode), `EMPLOYEE_IMPORT_EMPLOYMENT_STATUSES` = ACTIVE/INACTIVE/SUSPENDED/RESIGNED (documented in the template guide sheet), `EMPLOYEE_IMPORT_MAX_ROWS` = 1000, `employeeImportRowSchema` (zod), preview/batch/commit result types. New additive permission `employees.import`.
- **API (apps/api/src/modules/employees/import.ts):** `GET /employees/import-template` (two sheets: Data header + Petunjuk rules; no fabricated example identities), `POST /employees/import/preview` (multer memory 2 MB, ZIP magic check, `read-excel-file` v9 parse, exact header contract, per-row zod + intra-file duplicate + cross-source code conflict + homeStationCode must match an ACTIVE Location), `POST /employees/import/:batchId/commit` (global scope, PREVIEWED-only → 409 on repeat, single `prisma.$transaction` re-validates each row then upserts, writes batch counts + `EmployeeSyncLog(sourceSystem='IMPORT')` inside the same transaction, `EMPLOYEE_IMPORT_COMMIT` audit after), `GET /employees/import/batches` and `/batches/:batchId` (history + per-row detail). Preview/commit/history require global scope; template requires the permission only. Invalid rows are never committed and remain visible in history.
- **Dependency:** `read-excel-file@9.3.20` added to apps/api (parser counterpart of the existing `write-excel-file`; v9 API returns all sheets from the default export). No other dependency changes.
- **RBAC (additive only):** `employees.import` granted to SYSTEM_ADMIN (via allExcept) + DORMITORY_ADMIN; route-level global-scope guard means scoped dormitory admins still cannot import. No existing grant removed or altered.
- **UI:** EmployeesPage gains an "Impor Excel karyawan" card (permission-gated): template download, upload modal with labeled file input and limits helper, preview table with per-row action badges (Baru/Perbarui/Tidak valid) and inline error lists, ConfirmDialog before commit, success summary, and an import history list with per-batch detail reopen. Sync history card unchanged; IMPORT runs now also appear there.
- **Verification:** API+web typecheck EXIT=0, root ESLint EXIT=0; integration `employees-import.test.ts` 5/5 (template contract, preview errors + transactional commit + sync log + audit + history + repeat-commit 409, UPDATE re-import, cross-source conflict, malformed files + RBAC); affected suites `employees-sync`, `auth-rbac`, `locations`, `master-data-access` 32/32; Playwright `employee-import.spec.ts` 2/2 (template download; upload → preview errors → confirm → success → history → search → refresh persistence), `management`+`rbac`+`master-data-access` 14/14, `a11y` 4/4. Live browser check of panel + modal. E2E fixtures removed from dev DB afterwards (0 IMPORT employees remain).
- **Approver/source:** Master full-stack brief Phase 5 (template, upload, preview, validation, per-row errors, confirm commit, transaction, audit, history; no fabricated identities).
- **Status:** Accepted.

## D-049 — Phase 4/7/10: accommodation master Excel import (dormitories, buildings, rooms, beds)
- **Date:** 2026-11-21 · **Status:** Accepted · **Scope:** additive; no existing table, permission grant, or business rule altered.
- **Schema:** new `master_import_batches` (entity discriminator + same counters/status as employee batches) and `master_import_rows` (batch FK Cascade, data/errors Json, action, entityId). Migration `20261121155922_master_import` applied to dev and test DBs. Employee import tables untouched.
- **Contract (packages/shared):** generic `ImportPreviewRow/ImportBatchSummary/ImportPreview/ImportCommitResult/ImportRowAction` with `EmployeeImport*` aliases kept; `MASTER_IMPORT_ENTITIES`, `MASTER_IMPORT_COLUMNS`, `MASTER_IMPORT_MAX_ROWS=1000`, four zod row schemas (Indonesian messages).
- **Endpoints:** GET `/master-data/import-template?entity`, POST `/master-data/import/preview?entity`, POST `/master-data/import/:batchId/commit`, GET `/master-data/import/batches?entity`, GET `/master-data/import/batches/:batchId`. Permission per entity reuses existing codes (`dormitories.create`, `buildings.manage`, `rooms.create`, `beds.manage`) — no new permission codes; global-scope guard on preview/commit/history; commit resolves permission from the stored batch entity.
- **Business rules preserved:** parents must already exist (no auto-creation of buildings/floors/rooms; errors guide to forms); dormitory `locationCode` must exist and be ACTIVE; existing rooms reject roomTypeCode change via import; UPDATE never touches operational/housekeeping status, eligibility, capacity, address, contacts or coordinates; creates mirror form defaults (room/bed ACTIVE + READY, genderPolicy UNSPECIFIED); intra-file duplicate keys rejected; commit revalidates every reference inside one `$transaction` (60s) and marks skipped rows INVALID with reasons; batch counters + errorSummary persisted; audits MASTER_IMPORT_TEMPLATE_DOWNLOAD/PREVIEW/COMMIT (append-only).
- **UI:** generic `ExcelImportPanel` extracted (identical employee strings preserved); `EmployeeImportPanel` now a thin wrapper; new `MasterImportPanel` rendered on Master Data subs unit-akomodasi/gedung/kamar/tempat-tidur, permission-gated, with per-entity preview columns, template download, history + detail reopen.
- **Verification:** API+web typecheck clean, ESLint clean on changed files; integration `master-import.test.ts` 6/6 (template contracts ×4 + invalid entity 400; beds preview errors/commit/audit/history/detail/409/UPDATE label; rooms INSERT + type-change rejection + UPDATE name/gender; buildings INSERT+UPDATE+unknown parent; dormitories INSERT+unknown location; commit-time revalidation skip; malformed 415/400/400/400 + crew 401/403 + unknown batch 404); affected suites 8 files 50/50; Playwright `master-import.spec.ts` 2/2 and `employee-import`+`master-data-access`+`a11y` 14/14; live browser snapshot of tempat-tidur panel. Dev-DB E2E fixtures removed afterwards (1 employee, 1+3 batches, 1 sync log, 1 dormitory); audit entries kept.
- **Approver/source:** Master full-stack brief Phases 4/7/10 + REAL DATA POPULATION brief §3 (input pages so administrators can fill verified facility data; no fictitious buildings/rooms/beds).

## D-050 — Zero-demo operational environment: password auth, admin bootstrap, FK-safe purge with isolation, demo-display gating, E2E fixture separation

- **Date:** 2026-11-22
- **Decision:** Convert the development environment from mock/demo to a honest operational baseline: `AUTH_MODE=password` + `SEED_DEMO=false`, all demo operational data purged transactionally (with verified backup and restore drill), demo user accounts isolated instead of deleted (append-only audit integrity), every demo banner/badge/disclaimer in the web app gated to the mock fixture environment, and E2E tests fully separated onto `whoosh_stay_e2e`. No real KCIC data, credentials or endpoints were invented; where no verified source exists the system shows true zeros and professional empty states.
- **E2E separation:** Playwright `globalSetup` migrates and seeds a dedicated `whoosh_stay_e2e` database (deterministic fixture: 12 users, 110 employees, 5 dormitories, 30 rooms, 150 beds) and starts API/web on ports 4001/5175. Integration tests use `whoosh_stay_test`. Neither touches the dev database anymore; the stale 34-room pagination expectation was corrected to the deterministic 30 (intent preserved, not weakened).
- **Backup + drill:** `backups/whoosh_stay-20261121T164157Z.dump` (402,310 bytes, SHA-256 `42a5f65833b37a211a7f175441a35d893d148419bc6bdeb19876dfe0d62733dd`). Restore drill passed into an isolated database: 46 tables, 1,475 rows, 9 migrations, append-only audit trigger intact (forbidden UPDATE rejected). This is the pre-purge rollback point.
- **Purge (`apps/api/src/database/purge-demo.ts`):** `--execute` flag; refuses any test/e2e database URL; origin gate aborts if any non-demo operational row exists; single `prisma.$transaction` deletes in FK order (recommendations → bedAllocations → reservations → housekeepingTasks → maintenanceTickets → inventoryBlocks → attachments → photos → notificationDeliveries → notifications → rosterAssignments → rosterSyncRuns → employeeSyncLogs → beds → rooms → floors → buildings → dormitories → DEMO roomTypes/facilities/policies → DEMO employees), then removes demo UserRoles (13) and Sessions (910) and **isolates** the 12 demo users: `status='DISABLED'`, `demoPasswordHash=null`. Deletion of the users themselves is impossible without violating the append-only audit trigger: `audit_logs.actorUserId` is `ON DELETE SET NULL`, which would UPDATE audit rows (rejected with `42501`). Isolation preserves the audit trail while making the accounts credential-less, role-less, session-less and unable to log in. Deleted: 189 allocations, 230 reservations, 15 housekeeping tasks, 10 maintenance tickets, 1 inventory block, 1 attachment, 180 photos, 1 delivery, 80 notifications, 50 roster assignments, 1 sync log, 158 beds, 34 rooms, 10 floors, 5 buildings, 5 dormitories, 2 room types, 3 facilities, 1 policy, 110 employees. MinIO: 361 demo objects removed, 0 failures. Verified end state: 0 employees/dormitories/rooms/beds/reservations; 5 locations, 8 roles, 61 permissions, 1,087 audit logs intact; 12 DISABLED users + 1 bootstrap admin.
- **Password auth + secure bootstrap:** `POST /api/v1/auth/login` verifies scrypt hashes (`scrypt$salt$hash`); generic 401 "Email atau password salah." (no user enumeration); SUSPENDED/DISABLED → 403; failed attempts audited with `actorUserId=null`. `dev-login` is unmounted outside mock mode (404 in password mode). `apps/api/src/database/bootstrap-admin.ts`: minimum 12-character password (or cryptographically random generated password printed exactly once), rejects `@demo.whoosh-stay.local`, never overwrites an existing user, creates GLOBAL SYSTEM_ADMIN + `ADMIN_BOOTSTRAP` audit in one transaction. Dev admin bootstrapped: `admin@whoosh-stay.local` (generated one-time password delivered to the operator out-of-band; rotate after first login). Production continues to refuse mock authentication; RBAC unchanged.
- **Demo-display gating:** new `useIsDemoEnv()` hook (`session.authMode === 'mock'`). Every DEMO banner, badge, photo overlay and simulation disclaimer (layouts, crew home/search/reservations/notifications/help/profile/dormitory, dashboard, employees, inventory, master data, roster) renders only in the mock fixture environment. Password/OIDC sessions show zero demo text; footers state "Data operasional" and auth badges state "Login email"/"SSO aktif". Name-normalization helpers (`displayName`) are kept — they strip fixture prefixes without displaying demo labels, and fixture tests depend on them. The only remaining "Demo" strings in the operational UI are the 12 isolated DISABLED accounts in Users & Access and immutable audit-history entries — honest records, not operational data presented as real.
- **Responsive fix (audit #45):** `StatCard` made shrink-safe (`min-w-0`, `break-words`, shrink-0 icon) and four KPI strips (Housekeeping, Management Reservations, Employees, Maintenance) changed to `grid-cols-1 sm:grid-cols-2 xl:grid-cols-4`, eliminating horizontal overflow at 320/360/375/390 px.
- **Test timezone fix:** `reservations-flow.test.ts` `isoDate()` now aligns with Asia/Jakarta (UTC+7) because the API validates check-in against `todayInJakarta()`; the previous UTC-based helper produced "yesterday" between 00:00–07:00 WIB and failed with 400. Test intent unchanged.
- **Verification:** API+web typecheck exit 0; ESLint exit 0 on all changed files; env unit 9/9; `auth-password` integration 8/8 (login/session/lastLoginAt, generic 401 + failed-login audit, hashless 401, SUSPENDED 403, malformed 400, scrypt format, bootstrap provided/generated/no-overwrite/weak/demo-domain/missing-email); full integration regression 17 files / 98 tests passed against `whoosh_stay_test`; full Playwright suite on the isolated fixture (results recorded in IMPLEMENTATION_STATUS §3); live browser verification of the dev UI: login page shows email/password only (no demo selector), admin login succeeds, dashboard shows true zeros ("0 dari 0 tempat tidur terisi"), master data lists exactly the 5 verified locations with "Belum diverifikasi" addresses, and a 15-page management sweep found no demo text and no horizontal overflow.
- **Approver/source:** REAL DATA POPULATION & ZERO DEMO/DUMMY brief §§1–8 (safe isolation after audit+backup, no fabricated data, honest empty states, full-stack persistence) + master full-stack brief Phases 6/13/14/15.
- **Status:** Accepted.

## D-051 — Unified design workflow: ui-ux-pro-max direction + Hallmark QC in one project skill

- **Date:** 2026-11-22
- **Decision:** Ship a project-level skill `.qoder/skills/whoosh-design-review/` that runs both design skills in one flow: ui-ux-pro-max supplies direction, patterns and accessibility rules; Hallmark audits the result (report-only) through `scripts/audit.mjs`, a thin wrapper over `sloplint.mjs --scope app --genre modern-minimal`. Hallmark keeps its audit-only contract on this repo (no `redesign`, no theme dealing, no rebuilt shell); WHOOSH STAY identity (`#8B1A1A`, brand tokens, Plus Jakarta Sans) stays authoritative per D-046.
- **Baseline audit (2026-11-22, `apps/web/src`):** 158 findings — 143 floor FAIL, 14 reflex (13 WARN + 1 REFLEX), 1 finish WARN. Largest groups: gate 67 uppercase tracked labels (78), gate 48 colour literals (22), gate 54 eyebrow labels (17), gate 19 em-dash copy (13). The ui-ux-pro-max search CLI needs Python, which is not installed on this machine; the skill instructs the agent to read its reference files directly and never fake a search result.
- **Fix policy:** token literals, LCP `fetchpriority`, missing `:active`, single hover signal, elevation consistency, decorative width/height animations and the Hallmark audit stamp are fixed in the existing system. The uppercase/tracked page-header and sidebar-group pattern (54/67), Indonesian em-dash copy asserted by tests (19), the requested sidebar width collapse animation (10a) and glass surfaces (29) are waived on record — removing them would be the redesign the brief forbids.
- **QC batch (2026-11-22, in the existing system):** gate 48 colour literals 22 → 0 (new `@theme` tokens `brand-accent`, `login-deep`, `login-card`, `photo-shadow`, `shadow-login-card`, `shadow-login-button`, gradient variables; `Logo.tsx` and `LoginPage.tsx` now use them); gate 20 stamp 1 → 0 (first CSS line of `styles.css`); gate 26b 1 → 0 (`:active` states in `AttachmentsPanel`); gate 11 1 → 0 (gallery thumbnail hover-scale removed); gate F24 1 → 0 (notification popover uses `shadow-pop` only); gate 10a 4 → 1 (dashboard occupancy/trend bars animate `clip-path` instead of width/height; the sidebar width animation stays waived). Net: **158 → 129 findings** (floor 117 / reflex 12 / finish 0). Remaining groups are the waived brand pattern 67 (78) and 54 (17), test-asserted copy 19 (13) and 63 (5), dense calendar labels 49 (2), below-fold lazy images 28a (1), the sidebar width animation 10a (1), glass 29 (6) and semantic status palette 74 (6).
- **Verification:** root typecheck exit 0 and lint exit 0 after the batch; targeted Playwright batch 26/26 (a11y 4, management 4, brand 3, sidebar 4, sidebar-navigation 8, crew 3); full Playwright suite **90/90 passed (13.0 min)** on the isolated `whoosh_stay_e2e` fixture; login and dashboard visually checked at 1440×900 and 360 px with zero horizontal overflow. The 18-route management axe scan uses a 120 s per-test timeout (assertions unchanged) because fresh axe analyses exceed the 45 s default; no `apps/web/src` edits are made while Playwright runs.
- **Approver/source:** user request 2026-11-22 (“satukan Hallmark dengan ui-ux-pro-max… berjalan bareng”) + D-046 split.
- **Status:** Accepted; QC batch complete.

## D-052 — Sidebar collapsible group navigation (accordion)

- **Date:** 2026-11-22
- **Decision:** Both shells keep the single shared `AppSidebar`. Every group with more than one destination (or with child links, or explicitly flagged `collapsible`) renders its heading as a button trigger with `aria-expanded` and `aria-controls`; one group is open at a time (`openGroupKey`), the group containing the active route opens automatically on navigation (effect on `activeGroupKey`), and the chevron rotates 200 ms. Single-destination groups (e.g. housekeeping's Dashboard) stay plain headings via the config `collapsible` flag instead of hardcoded key checks.
- **Behaviour:** panels animate `grid-template-rows` 1fr/0fr plus opacity for 200 ms with `motion-reduce` fallback; a closed panel is `invisible` and `inert`, so its links leave both the tab order and the accessibility tree. The collapsed rail hides group headings and keeps the existing flyout/tooltips; the mobile drawer uses the same accordion and closes on navigation. Active item styling, ivory fill and `aria-current` are unchanged.
- **Constraints honoured:** no route, API, database, RBAC or business-rule changes; groups and items stay driven by the existing navigation config and permission filters; sidebar background stays exactly `#8B1A1A`; brand typography (uppercase tracked group labels) preserved.
- **Verification:** `tests/e2e/sidebar-navigation.spec.ts` 8/8 (new accordion test: group toggles, single-open behaviour, auto-open on deep link, `aria-expanded` state); targeted regression batch of 26 E2E tests green; typecheck/lint exit 0.
- **Approver/source:** user brief 2026-11-22 “WHOOSH STAY — SIDEBAR COLLAPSIBLE GROUP NAVIGATION”.
- **Status:** Accepted.

## D-053 — Prepared external adapters: SMTP, Telegram, HTTP employee sync (all OFF by default)

- **Date:** 2026-11-22
- **Decision:** Implement real outbound adapters behind the existing mock paths so credentials can be added later without code changes. Nothing is activated by default: `EMAIL_PROVIDER=mock`, empty `TELEGRAM_BOT_TOKEN` and `EMPLOYEE_SYNC_ENABLED=false` keep today's exact behaviour.
- **Email:** `SmtpEmailProvider` (nodemailer, injectable transport) is used only when `EMAIL_PROVIDER=smtp` and host + sender are set; startup validation rejects incomplete SMTP config. `notification_deliveries` rows become `SENT`/`FAILED` with provider message id and error instead of `MOCK_DELIVERED`; sending still requires the `notifications.emailEnabled` system setting.
- **Telegram:** `TelegramProvider` posts `sendMessage` with `AbortSignal.timeout` and sanitized failures (never echoes the bot token). Delivery still requires `notifications.telegramEnabled`; the recipient is the user's own binding via new `users.telegram_chat_id` (additive migration `20261122150000_user_telegram_chat_id`), set with self-only `PUT /api/v1/auth/me/telegram` (numeric chat ID validation, audit `USER_TELEGRAM_CHAT_UPDATED` without storing the ID in audit data) and exposed as a card on both profile routes. Reservation created/confirmed/rejected notifications now include TELEGRAM in their channel list; other notification types stay in-app only.
- **Employee sync:** `HttpEmployeeProvider` performs a GET against `EMPLOYEE_SYNC_BASE_URL` + `EMPLOYEE_SYNC_PATH` with bearer/api-key/basic auth, timeout, and a strict response schema (array or `items`/`data`/`employees` envelope; camelCase or snake_case keys). Invalid records or non-2xx responses fail the run and are recorded in `employee_sync_logs`. `employeeSyncMode()` now reports `DISABLED | MOCK | CONFIGURED`; the production guard that refuses `EMPLOYEE_SYNC_ENABLED` is retained until the official contract is approved. `syncEmployees()` uses `createEmployeeProvider()` (HTTP only when the flag and base URL are present, otherwise the DEMO provider).
- **Constraints honoured:** no RBAC changes; no production credentials or invented endpoints; no mock authentication changes; mock DB rows unchanged when adapters are unconfigured; audit remains append-only; `.env.example` documents every new variable with empty/false values.
- **Verification (2026-11-22):** Prisma client regenerated and the new migration applied to the dev database; root typecheck exit 0, lint exit 0, production build exit 0; unit **53/53** (provider mapping/headers/errors, env validation); full integration **116/116** (including new `auth-telegram` binding test); full Playwright suite **91/91 passed (12.7 min)** on the isolated `whoosh_stay_e2e` fixture, including the new profile binding spec (save, reload persistence, unlink in a real browser); design audit unchanged at 129 findings, all previously waived; `db:verify` passed (50 tables, 12 migrations).
- **Approver/source:** user request 2026-11-22 “siapkan dulu adapter email, Telegram, dan HTTP employee sync dengan flag masih off, supaya nanti tinggal saya isi kredensialnya”.
- **Status:** Accepted; adapters prepared and inactive by default.
