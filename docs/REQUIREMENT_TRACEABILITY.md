# Whoosh Stay — Requirement Traceability

**Date:** 2026-11-22
**Level:** Group-level mapping updated after Phases 2–7 execution and the zero-demo operational baseline (D-050). Concrete test evidence is recorded in `IMPLEMENTATION_STATUS.md` §3; per-feature full-stack chains are in `INTEGRATION_MAP.md`; data readiness per category is in `DATA_READINESS.md`.
**Environment:** Development runs `AUTH_MODE=password` against a purged operational database (verified 5-location master + RBAC base + bootstrap admin; demo data removed/isolated). External integrations are mock-only and explicitly labelled; synthetic fixtures live only in `whoosh_stay_test`/`whoosh_stay_e2e`.

Status vocabulary: NOT STARTED | IN PROGRESS | IMPLEMENTED | TESTED | PARTIALLY VERIFIED | BLOCKED.

---

## 1. Functional requirements

| Ref | Requirement | Module(s) | API | Tests | Phase | Status |
|---|---|---|---|---|---|---|
| FR-AUTH-001..006 | OIDC auth, subject mapping, session expiry/logout, gated mock auth, privileged logging | auth | `/auth/*` | Unit prod guards; integration lifecycle; E2E login/logout | 1 | TESTED with mock sessions; real OIDC adapter awaits an official issuer |
| FR-EMP-001..005 | Employee mirror, idempotent sync, minimal PII, self-only crew view | employees | `/employees`, sync-runs | Mock sync idempotency; crew denial | 1, 5 | TESTED for mock sync; live provider BLOCKED by missing contract |
| FR-DORM-001..006 | Hierarchy CRUD, room types/facilities, safe deactivation, manager scope | inventory | `/dormitories`, `/buildings`, `/floors`, `/rooms`, `/beds`, `/facilities` | Page load; scope; DB constraints; CRUD used by tests | 2 | IMPLEMENTED / PARTIALLY VERIFIED — safe-deactivation guard not covered by a dedicated automated test |
| FR-AVAIL-001..006 | Full-interval availability, exclude allocations/blocks/not-ready, recheck in transaction | availability, reservations | `/availability` | Grouped availability; readiness window config; concurrency allocation | 3 | TESTED |
| FR-RES-001..012 | Sources, codes, state machine, approval, cancellation, history, idempotency, own-only access, group guests | reservations | `/reservations*`, `/my/summary` | Lifecycle, approval separation, replay, rejection, cross-crew 403 | 3 | TESTED — group-guest expansion is IMPLEMENTED but only single-guest flows are exercised end-to-end |
| FR-ALLOC-001..008 | Bed-level allocation, transactional recheck, exclusion backstop, conflict mapping, history | reservations, lib/scope | `/reservations*` allocation routes | Concurrent same-bed test (`201` + `409 BED_ALLOCATION_CONFLICT`), DB exclusion test | 3 | TESTED — separate preview endpoint and reassignment-race suite are PARTIALLY VERIFIED |
| FR-STAY-001..008 | QR/manual lookup, hash + single-use + expiry, check-in/out, readiness, audit | stays | `/stays/*`, `/reservations/:id/qr` | QR issue, validate, check-in, replay 409, active stay, check-out | 4 | TESTED — expiry clock path is IMPLEMENTED but not exercised with a time-warped test |
| FR-HK-001..004 | Tasks, checklist, readiness, complete vs verify | housekeeping | `/housekeeping/tasks*` | Permission separation; checklist completion; verify | 4 | TESTED — evidence attachments NOT IMPLEMENTED |
| FR-MTN-001..004 | Tickets, inventory blocking, resolve/close without auto-ready, attachments | maintenance | `/maintenance/tickets*` | Block creation/release; close permission denial | 4 | TESTED except attachments (NOT IMPLEMENTED) |
| FR-ROSTER-001..008 | Adapter boundary, idempotent sync logs, dry-run, outage tolerance, no mutation of confirmed stays | roster | `/roster/*` | Preview, sync, rerun idempotency, manager sync denial, MOCK label | 5 | TESTED for assignment sync with `MOCK_ROSTER`; recommendation → reservation automation is NOT IMPLEMENTED |
| FR-NOTIF-001..005 | In-app notifications, optional channels, delivery logs, safe templates, non-blocking failures | notifications | `/notifications*`, `/admin/notification-deliveries` | Read/mark-all; delivery log access control; MOCK status | 3, 6 | TESTED for in-app + mock channel logging; real email/Telegram BLOCKED by providers |
| FR-REPORT-001..005 | Report families, same scope as source, safe exports, KPI definitions, XLSX/PDF | reports | `/reports/*` | Scope denial for SELF; CSV and XLSX export (signature asserted); page load | 6, C–D | PARTIALLY VERIFIED — 3 families + CSV/XLSX implemented; PDF and remaining families NOT IMPLEMENTED |
| FR-AUDIT-001..003 | Critical-change audit with actor/entity/request id, no secrets, append-only | audit | `/admin/audit-logs` | Integration reads; DB append-only trigger | 1+ | TESTED |
| FR-CONF-001..002 | Configurable policies/approvals, protected + audited changes, pending decisions surfaced | settings, reservations | `/settings`, `/policies` | Setting persistence, D-008 pending badge, policy CRUD | 1, 3 | TESTED — D-008 value remains a stakeholder decision |
| FR-LOC-001..004 | Five verified operational locations, idempotent seed, optional dormitory link, no invented addresses | master-data, inventory | `/master-data/locations*` | locations integration 6/6 (seed integrity, CRUD+audit, link guard, RBAC, export); E2E 8/8 | 3 (D-047) | TESTED |
| FR-EMPIMP-001..005 | Employee Excel template → preview → confirm → transactional commit, per-row errors, provenance, history | employees/import | `/employees/import*` | employees-import integration 5/5; E2E 2/2 | 5 (D-048) | TESTED |
| FR-MASTERIMP-001..005 | Accommodation Excel import (dormitories/buildings/rooms/beds), parent-reference validation, no auto-invention | master-data/import | `/master-data/import*` | master-import integration 6/6; E2E 2/2 | 4/7/10 (D-049) | TESTED |
| FR-AUTH-PW-001..004 | Email/password login (scrypt), generic 401, status guards, secure first-admin bootstrap, no demo endpoint in password mode | auth, database/bootstrap-admin | `/auth/login`, `/auth/config` | auth-password integration 8/8; env unit 9/9; live API + browser login | 6 (D-050) | TESTED |
| FR-DATA-001..003 | Zero-demo operational baseline: safe purge with backup/origin-gate/transaction, audit-preserving account isolation, demo-display gating | database/purge-demo, web auth gate | purge CLI; `useIsDemoEnv` | purge dry-run + execute verified via psql; restore drill; 15-page live UI sweep | 13 (D-050) | TESTED |

## 2. RBAC and security

| Ref | Requirement | Verification | Phase | Status |
|---|---|---|---|---|
| RBAC-1..10 | 8 roles, permission catalog, scopes GLOBAL/DORMITORY/BUILDING/ASSIGNED_TASK/SELF, deny by default, object-level auth, export scope | API denial tests per module; E2E crew denials incl. reports/roster/settings; scoped lists | 1–7 | TESTED |
| SEC-1 | No client-trusted role/employee/scope/status | Server-derived session/principal; body tampering ignored | 1+ | TESTED for auth/roles and implemented modules |
| SEC-2 | QR protection, rate limits, log redaction, no token leakage | 32-byte token, SHA-256 storage, single-use; helmet + auth limiter; pino redaction; attachment magic-byte validation with API-only streaming | 4, 7, B | IMPLEMENTED / PARTIALLY VERIFIED — no global API limiter; QR expiry clock path only implemented |
| SEC-3 | Production refuses mock auth/unsafe flags | Unit startup-guard tests | 1 | TESTED |
| SEC-4 | Reports cannot be widened by SELF scope | `assertReportAccess` returns 403 for SELF-only principals | 6 | TESTED |
| SEC-5 | State-changing requests resist cross-site abuse | `SameSite=Lax` + HttpOnly session cookie; Origin allow-list on unsafe methods | 1, E | TESTED (blocked/allowed Origin integration test); no dedicated CSRF token |

## 3. Non-functional requirements

| Ref | Requirement | Verification | Phase | Status |
|---|---|---|---|---|
| NFR-PERF | p95 API ≤ 500 ms, availability ≤ 2 s, dashboard ≤ 3 s at 100 VU | Local sequential fetch harness (20 samples/endpoint) | G | PARTIALLY VERIFIED — local p95 ≤ 77 ms for measured endpoints; 100-VU load test NOT EXECUTED |
| NFR-REL | Manual booking works with integrations off; idempotent writes; health endpoints | Flags default off; idempotency tests; health probes | 3, 7 | TESTED for idempotency/health; outage-injection PARTIALLY VERIFIED |
| NFR-A11Y | Responsive, keyboard, focus, labels, contrast, non-color status | Axe WCAG 2.1 A/AA on login, 11 crew and 18 management routes + modal; modal focus trap; 6-width overflow audit; text badges | 7, E | PARTIALLY VERIFIED — automated scans clean; no full manual keyboard walkthrough |
| NFR-DATA | UUID/date/capacity validation, unique source identities, no magic JSON | Zod validation, DB constraints, exclusion/append-only tests | 1–5 | TESTED |
| NFR-OPS | Compose, migrations/seed, OpenAPI, structured logs, backup runbook | Dev + production Compose syntax-validated; migrations; seed; logs; DB and MinIO restore drills executed | 1, 7, H–J | PARTIALLY VERIFIED — backup/restore drill executed (41/41 tables, 832/832 rows, 700 objects); CI workflow authored but NOT EXECUTED on a hosted runner; production deploy BLOCKED by missing OIDC issuer/TLS; scheduled backups, PITR and monitoring NOT IMPLEMENTED |

## 4. UI/UX requirements

| Ref | Requirement | Routes | Verification | Phase | Status |
|---|---|---|---|---|---|
| UI-CREW | Home, search, detail, booking, reservations, history, QR, profile/help, stay schedule | `/crew/*` | E2E search, create+cancel, page crawl; responsive; `/crew/schedule` month grouping | 2–4, C | TESTED |
| UI-MGMT | Grouped modules, every submenu a real page, permission-aware | `/manage/*` | E2E crawl of all sections; permission-filtered nav; 20 management routes opened from the sidebar | 2–6 | TESTED |
| UI-STATUS | Semantic status labels with text/icon, no color-only | All status surfaces | `StatusBadge` text labels; E2E assertions | 2–6 | PARTIALLY VERIFIED — contrast audit pending |

## 5. Product acceptance criteria

| AC | Criterion | Gate | Status |
|---|---|---|---|
| AC-1 | Crew completes manual booking end-to-end | Phase 3 | TESTED (E2E + integration) |
| AC-2 | Admin configures dormitory hierarchy and beds | Phase 2 | IMPLEMENTED / PARTIALLY VERIFIED (UI + API; not a single end-to-end test) |
| AC-3 | Availability accurate for intervals | Phase 3 | TESTED |
| AC-4 | Concurrent attempts cannot double-allocate | Phase 3 | TESTED (one 201, one 409; single HELD row) |
| AC-5 | Approval/cancellation enforced server-side | Phase 3 | TESTED |
| AC-6 | Check-in/out produces correct occupancy history | Phase 4 | TESTED |
| AC-7 | Housekeeping/maintenance block inventory correctly | Phase 4 | TESTED |
| AC-8 | Roster sync idempotent; exceptions visible | Phase 5 | PARTIALLY VERIFIED (idempotent sync + run history; exception queue/conversion not implemented) |
| AC-9 | Crew cannot access others' reservations | Phase 3+ | TESTED |
| AC-10 | Management data scope enforced by backend | Phase 1+ | TESTED for implemented modules |
| AC-11 | Core workflow works with integrations disabled | Phase 3+ | TESTED (defaults disabled) |
| AC-12 | Every primary nav item opens a real implemented page | Each gate | TESTED (E2E crawl, sidebar colour check, sidebar-navigation route sweep) |
| AC-13 | Sidebar is derived from role permissions; unauthorized items and empty groups are hidden; direct URLs stay server-guarded | Sidebar redesign | TESTED (housekeeping + dormitory manager visibility; API 403 for denied settings/users) |
| AC-14 | Submenus toggle, stay open on an active child, support deep links/history, collapsed flyouts and the mobile drawer | Sidebar redesign | TESTED (`sidebar-navigation.spec.ts`) |
| AC-15 | Sidebar remains reachable with zero horizontal overflow at 360–1920 px and at zoom-equivalent widths 720–3840 | Sidebar redesign | TESTED (responsive audit incl. Master Data; 1920 and 50–200% zoom equivalents) |

## 6. Open stakeholder decisions

The 19 items in `OPEN_DECISIONS.md` remain open. Implemented safe defaults and pending items are recorded in `docs/DECISIONS.md`; D-008 readiness-window policy is configurable and explicitly marked pending in the settings UI. It must not be treated as approved.
