# Whoosh Stay — Implementation Plan

**Date:** 2026-11-21
**Current state:** Discovery complete (Roadmap Phase 0). No implementation started.
**Next instruction unlocks:** Roadmap Phase 1 (Foundation).

Sizes are relative effort, not calendar commitments (roadmap §6): S ≤ 2 points, M ≤ 5, L ≤ 10, XL > 10 (1 point ≈ half engineer-day, indicative only).

---

## 1. Delivery principles

1. Build vertical, working slices; never leave visible controls inert.
2. Backend is authoritative; frontend consumes real APIs only.
3. Critical invariants are proven by tests before dependent features: interval math, exclusion constraint, state machine, scope resolver.
4. Phase gates are hard: no phase starts on a failing previous gate except additive documentation work.
5. External dependencies never block: adapters + deterministic mocks + feature flags; manual workflows always available.
6. Documentation moves with code: status, decisions, changelog, traceability updated per phase.
7. No scope creep: no marketplace, payments, driver tracking, payroll, roster authoring, microservices.

Critical path: **Phase 1 → 2 → 3 → 4 → 7**. Phase 5 can overlap late Phase 4 backend. Phase 6 starts after Phase 4; reporting depends on roster only for roster-specific reports.

---

## 2. Phase overview

| Roadmap phase | Outcome | Key dependencies | Size | Gate |
|---|---|---|---|---|
| 0 — Discovery (done) | Analysis, plan, risks, status, decisions | Docs | S | No destructive change; plan documented |
| 1 — Foundation | Runnable monorepo, DB migrations, auth mock + OIDC adapter, RBAC core, shells, test harness | 0 | L | App starts; migrations clean; RBAC denial tests pass |
| 2 — Inventory | Dormitory hierarchy CRUD, beds, facilities, blocks, images, admin + crew browse | 1 | L | Inventory CRUD, scope, validation, audit tests pass |
| 3 — Booking core | Availability, reservations, approvals, allocation, concurrency, cancellation, crew journey | 2 | XL | Last-bed concurrency test + manual booking E2E pass |
| 4 — Stay operations | QR, check-in/out, occupants, readiness, housekeeping, maintenance | 3 | L | Stay lifecycle + readiness E2E pass; blocked inventory excluded |
| 5 — Roster automation | Providers, sync, policy engine, recommendations, conversion, exceptions | 2, 3 | L | Repeat sync yields no duplicates; automation feature-flagged |
| 6 — Notifications, reports, analytics | In-app center, external adapters, dashboards, reports, exports, calendar | 3, 4 | M/L | Export scope tests + delivery failure tests pass |
| 7 — Hardening | Security review, 100-VU baseline, accessibility/responsive audit, backup drill, prod profile | All | L | No critical/high defects; release checklist complete |

Priority labels: P0 = 1–4 core; P1 = 5, 6; P2 = advanced analytics/realtime (deferred).

---

## 3. Phase 1 — Foundation (next execution)

**Goal:** Runnable, testable skeleton with real schema and RBAC, no placeholder business modules.

| ID | Task | Outputs | Verification | Size |
|---|---|---|---|---|
| P1-01 | Workspace scaffold | Root `package.json` workspaces, `apps/api`, `apps/web`, `packages/shared`, strict TS configs, ESLint/Prettier, `.gitignore`, `git init` (after confirmation) | `npm install`, `npm run typecheck`, `npm run lint` | M |
| P1-02 | Environment validation | Zod env schema, fail-fast startup, `.env.example` with required/optional vars and safe defaults | Startup with missing/unsafe vars fails with clear error | S |
| P1-03 | Docker Compose | postgres:16, minio, minio-init (private buckets), health checks, named volumes | `docker compose up -d`; health checks green; DB reachable | S |
| P1-04 | Prisma schema v1 + migrations | All 37 documented tables, enums, checks, uniques, indexes; amendments: `beds.housekeeping_status`, `sessions`, `system_settings`; `btree_gist`; exclusion constraint; audit immutability trigger; partial unique active QR index | `migrate deploy` on empty DB; SQL assertions verify constraint/trigger/index | L |
| P1-05 | Seed framework | Idempotent seeds: permissions, roles, role-permission matrix, demo users per role (mock auth), synthetic employees; demo inventory seed schema ready (populated Phase 2) | Re-running seed produces no duplicates | M |
| P1-06 | API platform | Envelope + error catalog + middleware chain, request ID, pino redaction, helmet, rate-limit baseline, pagination/sort allowlist helper, health endpoints, OpenAPI generation + Swagger UI (dev) | Integration tests for envelope, 404, 422, request ID; OpenAPI endpoint serves | M |
| P1-07 | Auth | `IdentityProvider` interface; mock provider; OIDC adapter skeleton with PKCE/state/nonce; opaque session cookie, `sessions` table, logout; `/auth/me`, `/auth/logout`, `/auth/permissions`; production guards | Mock login, session expiry, logout; mocked OIDC claim mapping; prod refuses mock | L |
| P1-08 | RBAC core | Permission catalog incl. additions; route registry declaring permission/scope; `requirePermission`; scope resolver producing predicates; object-guard helpers; `/admin/users` + role assignment minimum | Allowed/denied matrix tests per role; registry test fails unprotected routes; self-approval guard test | L |
| P1-09 | Employee mirror read | Scoped employee list/detail; sync log skeleton + mock provider; `/employees` | Crew denied; admin allowed; idempotent mock sync | M |
| P1-10 | Design system + shells | Tokens (crew warm/management charcoal), primitives (button, input, select, dialog, badge, table, skeleton), Crew and Management layouts, permission-aware nav, auth guards, error/empty/permission states | Both shells render; nav hides by permission; keyboard/focus smoke; no overflow at 360px | L |
| P1-11 | Test harness | Vitest projects (unit/integration), test DB lifecycle, Supertest factory, Playwright config with webServer, seed reset script | CI-style command runs green locally | M |
| P1-12 | Living docs | `docs/IMPLEMENTATION_STATUS.md`, `DECISIONS.md`, `CHANGELOG.md`, `REQUIREMENT_TRACEABILITY.md`; consolidate spec files into `/docs` | Docs reflect actual state; no duplicated sources | S |

**Gate 1 (Gate A):** clean `migrate deploy`; seed idempotent; mock and OIDC-adapter tests pass; RBAC allow/deny suite passes; both shells run; health endpoints live; no unsafe production startup.

---

## 4. Phase 2 — Inventory

| ID | Task | Verification |
|---|---|---|
| P2-01 | Dormitory/building/floor CRUD with scope and safe deactivation (no orphaning active stays/history) | CRUD + deactivation guard tests; scope tests |
| P2-02 | Room types, rooms, beds, facilities, room-facility mapping; operational status and readiness commands | Validation, unique constraints, audit tests |
| P2-03 | Inventory blocks (maintenance/admin/cleaning) with date normalization and conflict visibility | Block overlap/date boundary tests |
| P2-04 | Image upload to MinIO with signed URLs and entity authorization | Upload MIME/size/authz tests; signed URL expiry |
| P2-05 | Management pages: Data Dormitory, Gedung & Lantai, Data Kamar, Data Tempat Tidur, Fasilitas, Ketersediaan (read) | Real CRUD UI, filters, pagination, error states |
| P2-06 | Crew browse: dormitory cards, detail with rooms/beds summary, labeled DEMO assets | Search/browse E2E; no fake availability claims |
| P2-07 | Audit coverage for inventory and readiness changes | Audit records include actor/entity/before-after |

**Gate 2 (Gate B):** inventory correctness and scope; blocked/inactive inventory can never be selected later.

---

## 5. Phase 3 — Availability, reservation, allocation (highest risk)

| ID | Task | Verification |
|---|---|---|
| P3-01 | Availability engine: per-night interval math, exclude inactive/blocked/not-ready per policy, aggregate counts, reasons | Unit interval/property tests; SQL plan review; query tests |
| P3-02 | Reservation aggregate + state machine + events; approval policy (single-step default, no self-approval); cancellation/no-show | Transition table tests (every allowed/denied edge); history integrity |
| P3-03 | Allocation preview (candidates + reasons) and execute (transaction, locks, exclusion backstop, retries) | Preview/execute integration tests; conflict mapping 409 |
| P3-04 | Idempotent create (`source`+key unique; payload hash conflict), booking code generator | Duplicate idempotency tests |
| P3-05 | Crew booking flow: search → detail → dates/occupants → review approval expectation → submit → pending/confirmed messaging | E2E manual journey; pending never shown as confirmed |
| P3-06 | Management pages: Cari & Booking (for-others permission), Daftar, Approval, Riwayat, Pembatalan/No-show, Alokasi/Pindah (preview), Ketersediaan | Scope-aware lists; approval separation; override reason required |
| P3-07 | **Concurrency proof:** two simultaneous requests for last bed; idempotency race; reassignment race | Exactly one success, one 409; single active allocation; audit trail consistent |
| P3-08 | Audit + notifications events for reservation lifecycle (in-app rows created post-commit) | Failure injection: notification error does not roll back booking |

**Gate 3 (Gate C):** concurrency suite green; full manual booking E2E; rejected/pending/cancelled states correct; scope + IDOR tests for reservations/allocations.

---

## 6. Phase 4 — Stay operations and readiness

| ID | Task | Verification |
|---|---|---|
| P4-01 | QR issuance/eligibility; hash storage; expiry; rotation; validate/confirm split with signed short-lived validation token; rate limiting | QR unit tests; duplicate concurrent scan → one success; expiry/used codes |
| P4-02 | Front desk check-in: arrival queue, keyboard-wedge/paste scan, manual lookup, identity checkbox per policy, idempotent commit | E2E scan/validate/check-in; duplicate rejected safely |
| P4-03 | Check-out: active stay required; per-guest records; reservation aggregate; bed/room set DIRTY; housekeeping task auto-created | E2E checkout; availability excludes until ready |
| P4-04 | Active occupants, allocation reassignment/release with history, room transfer page | Reassignment preserves history; confirmed occupants not silently moved |
| P4-05 | Housekeeping tasks, checklist, assignment, complete/verify; readiness transitions; verification policy | Readiness state tests; task completion ≠ ready when verification required |
| P4-06 | Maintenance tickets, attachments, inventory blocking, resolve/close; close does not auto-ready | Blocked inventory excluded from availability; close-without-verification test |
| P4-07 | Management pages for operations, housekeeping and maintenance; occupancy calendar | All submenu routes functional; calendar accessible list alternative |
| P4-08 | Stay lifecycle E2E (scan → check-in → check-out → cleaning → verified ready → bookable) | Gate D |

**Gate 4 (Gate D):** complete stay lifecycle E2E; readiness correctness; QR security tests; blocked inventory exclusion.

---

## 7. Phase 5 — Roster-assisted automation

| ID | Task | Verification |
|---|---|---|
| P5-01 | `EmployeeDirectoryProvider` and `RosterProvider` interfaces; deterministic mocks; `describeRequiredInput()`; feature flags | Provider contract tests; stubs return `INTEGRATION_UNAVAILABLE` |
| P5-02 | Sync runs with advisory lock, upsert by `(source_system, external_roster_id)`, payload hash, run logs, retry | Duplicate sync test: no duplicate rows/reservations; concurrent runs blocked |
| P5-03 | Finalized-only filter; policy engine (versioned criteria/rules) with recommendation/approval modes | Policy unit tests; drafts ignored; default recommendation-only |
| P5-04 | Recommendation generation, capacity preview, conversion per policy; match existing reservations; never mutate confirmed | Reconciliation tests; confirmed booking unchanged by roster update |
| P5-05 | Exception queue and resolution; sync log detail; dry-run preview | Exception lifecycle tests; actionable failures retained |
| P5-06 | Management pages: Sinkronisasi, Jadwal Dinas, Rekomendasi, Hasil Generate, Konflik & Exception, Log | All routes functional; integration-unavailable state shown |

**Gate 5 (Gate E):** idempotency proof; exceptions visible; auto-confirm remains disabled by default.

---

## 8. Phase 6 — Notifications, reporting, analytics

| ID | Task | Verification |
|---|---|---|
| P6-01 | In-app notification center, templates with allowlisted variables, unread counts, read actions | Template substitution safety; delivery logging |
| P6-02 | Email/Telegram adapters disabled without credentials; retry sweeper with attempt counts | Failure injection: booking remains committed; delivery retries recorded |
| P6-03 | KPI definitions (capacity, occupancy, availability, blocked, pending) documented and implemented consistently | KPI reconciliation vs allocation/reservation ledger |
| P6-04 | Reports: occupancy, reservations, usage, stays, housekeeping, maintenance with scoped filters | Scope tests; pending never counted as occupied |
| P6-05 | XLSX/PDF exports with formula-injection sanitization, row cap, same scope as list | Export scope tests; malicious cell sanitized |
| P6-06 | Dashboard: KPIs, arrivals/departures, pending approvals, readiness, exceptions; occupancy calendar | Dashboard E2E; filters by date/location |
| P6-07 | Management pages for reports/exports and dashboard | All submenu routes functional |

**Gate 6 (Gate F part 1):** export scope and delivery failure tests pass; KPI definitions match implementation.

---

## 9. Phase 7 — Hardening and release candidate

| ID | Task | Verification |
|---|---|---|
| P7-01 | Full E2E regression of 15 journeys in testing strategy | All green; failures triaged |
| P7-02 | Security review: IDOR matrix, forged claims, export bypass, rate limits, uploads, log leakage, self-approval | Documented findings; critical/high fixed |
| P7-03 | Performance baseline: 100 VU on dashboard, availability, reservation create, lists, report; p95 targets | Recorded results vs SRS targets; slow queries fixed |
| P7-04 | Accessibility/responsive audit: keyboard, focus, contrast, 360/768/1280 viewports | No blocking issues; manual checklist |
| P7-05 | Backup/restore drill; migration-from-clean verification; rollback notes | Restore evidence; clean migration pass |
| P7-06 | Production profile: Nginx static + API proxy, TLS assumptions, secret injection, health checks, docs runbook | Compose prod profile boots; runbook complete |
| P7-07 | UAT checklist, known limitations, stakeholder decisions list, release notes | Gate F complete |

**Gate 7 (Gate F):** no unresolved critical/high defects; verification commands and results recorded; stakeholder-dependent items explicitly listed, not silently defaulted.

---

## 10. Parallelization

| Track | Can proceed after | Work |
|---|---|---|
| Backend platform | — | P1-04…08 |
| Frontend system | P1-01, P1-02 | Tokens, primitives, shells, guards, API client (against live auth endpoints) |
| Contract alignment | P1-06 | Shared Zod DTOs + OpenAPI before page work |
| Phase 2 backend/UI | Gate 1 | Inventory API → admin pages; crew browse after room/bed endpoints |
| Phase 3 engine | Gate 2 | Availability + state machine first; allocation + UI second |
| Phase 4 vs 5 | Gate 3 | Stay ops backend can overlap roster sync backend; both share allocation facade |
| Phase 6 | Gate 4 | Reports can start on settled reservation/stay data |

Do not parallelize competing schema changes without a single migration owner.

---

## 11. Testing plan by phase

| Phase | Unit | Integration | E2E | Security/concurrency |
|---|---|---|---|---|
| 1 | Env parsing, scope predicate builder, permission checks | Auth session, RBAC allow/deny, seed idempotency, migration clean | Login, shell nav, permission-denied page | Unprotected-route registry test; mock auth production guard |
| 2 | Date normalization for blocks, readiness transitions | CRUD, deactivation guards, upload authz | Admin creates inventory; crew browses | Scope/IDOR on inventory; upload abuse |
| 3 | Interval math, transitions, policy, idempotency | Reservation transaction rollback, exclusion constraint, approval | Crew books → admin approves → confirmed; pending display | Last-bed race, duplicate idempotency, self-approval, reservation IDOR |
| 4 | QR hash/expiry, readiness policy | Check-in/out idempotency, HK generation, block exclusion | QR scan → check-in → checkout → cleaning → ready; maintenance block | Duplicate scan, QR rate limit, task/ticket IDOR |
| 5 | Roster mapper, policy, reconciliation | Duplicate sync, concurrent sync lock, exception lifecycle | Preview + conversion; confirmed booking unchanged | Integration-unavailable fallback; sync permission |
| 6 | Template substitution, KPI calculations | Delivery failure/retry, export queries | Dashboard, occupancy report + export | Export scope bypass, formula injection |
| 7 | — | Backup/restore, clean migration | Full regression | Full IDOR/claims/rate-limit matrix; 100 VU |

Test data: synthetic employees, DEMO-labeled dormitories, deterministic fixtures; no real KCIC names, locations or PII.

---

## 12. Definition of Done (every feature)

- Requirement mapped in `REQUIREMENT_TRACEABILITY.md`.
- Server-side validation + authorization + scope on every route; route registry updated.
- Migration and idempotent seed updated; clean-DB migration passes.
- Unit + integration tests added; E2E for critical journeys.
- UI states: loading, empty, error, permission denied, integration unavailable; no dead controls.
- Audit event for state changes with actor/reason; no secrets/PII.
- Docs: status, decisions, changelog updated.
- No unresolved critical/high defect introduced.

---

## 13. Planned verification commands (to run when code exists)

Not executed in discovery; listed so gates are objective:

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run test:integration        # Compose PostgreSQL test database
npm run test:e2e
npm run db:migrate              # migrate deploy on clean DB
npm run db:seed
npm run db:verify               # constraint/index/trigger assertions
docker compose up -d --build
docker compose ps
```

Each phase report records the actual command, result and any skipped verification.

---

## 14. Immediate next step

Execute Phase 1 task P1-01 only after authorization. Order inside Phase 1: P1-01 → 02 → 03 → 04 → 05 → 06 → 07/08 (with P1-10 in parallel after 01/02) → 09 → 11 → 12. Stop at Gate 1 with a verification report.

**Update 2026-11-21:** Phase 1 and the subsequent authorization for Phases 2–7 have been executed. See §15 and `IMPLEMENTATION_STATUS.md` for the delivered scope, evidence, and the items that remain mock/unverified.

---

## 15. Execution record — Phases 2–7 (2026-11-21)

| Phase | Delivered | Plan items not delivered |
|---|---|---|
| 2 Inventory | Hierarchy + room/bed CRUD, status changes, inventory blocks, management UI, DEMO seed (5/30/150) | P2-04 MinIO image/evidence upload |
| 3 Reservations | Availability engine, state machine, approval/rejection/cancel, allocation with exclusion backstop, idempotency, crew booking UI, management queue | Separate allocation preview endpoint, reassignment-race suite, group-guest E2E |
| 4 Stay ops | QR issue/validate/check-in/out, active stays, manual lookup, housekeeping checklist/verify, maintenance blocking | Attachments/evidence, occupation calendar |
| 5 Roster | Mock provider, preview/sync idempotency, run history, assignments UI | Recommendation generation and conversion into reservations, exception queue |
| 6 Reporting | In-app notifications, mock delivery log, 3 report families + CSV, settings/policies | XLSX/PDF, remaining report families, retry sweeper |
| 7 Hardening | Full typecheck/lint/build/test regression, responsive Playwright suite, RBAC E2E, docs | Performance baseline, production profile, backup drill, full a11y audit, CI pipeline |

Every item above is also listed with its verification evidence in `IMPLEMENTATION_STATUS.md` §3 and §5. No gate was reported as passed for a capability that is not implemented; the remaining items are explicitly open.
