# Full-Stack Integration Report — WHOOSH STAY

**Date:** 2026-11-22 · **Scope:** verification that every feature runs the complete chain React → shared zod contract → `apiRequest` → Express route → auth + `requirePermission` + scope → service/transaction → Prisma → PostgreSQL (constraints/triggers) → envelope → TanStack Query → UI, including the two newest modules (synthetic employees, accommodation research).
**Canonical per-module map:** [`INTEGRATION_MAP.md`](INTEGRATION_MAP.md) (auth/bootstrap, locations, employee import, accommodation import, reservations, stays/QR, housekeeping/maintenance, dashboard/analytics, notifications, reports/export, photos, purge/isolation). This report adds the new modules and records the current end-to-end evidence.

---

## 1. Cross-cutting guarantees (re-verified 2026-11-22)

| Guarantee | Mechanism | Evidence |
|---|---|---|
| Deny-by-default authorization | `requirePermission` on every business route; server-derived principal; scope predicates in lists/details/exports | integration 116/116 incl. RBAC denial suites; E2E `rbac.spec.ts`, `sidebar-navigation.spec.ts` (server 403s on direct URLs) |
| Bed allocation integrity | `bed_allocations_no_overlap` EXCLUDE USING gist → `23P01` → 409 `BED_ALLOCATION_CONFLICT`; `SELECT … FOR UPDATE` + availability recheck in transaction | `db:verify` PASS; concurrency test (one 201, one 409) |
| Append-only audit | Trigger rejects UPDATE/DELETE (`42501`); every mutation writes `audit_logs` | `db:verify` PASS; audit assertions in research/employee/import suites |
| Validation at the boundary | zod via `lib/validate.ts`; `ValidationError` → 400 with issues | integration validation cases across modules |
| Partial unique indexes | role assignments, reservation idempotency, one active QR per occupant | `db:verify` PASS |
| Storage isolation | MinIO streamed through API only; credentials never reach the frontend | gallery/attachment integration; code review |
| Auth mode enforcement | `AUTH_MODE=password` dev; `dev-login` only in mock non-prod; production refuses mock | `env.test.ts` 16/16, `auth-password.test.ts` 8/8, `auth-telegram.test.ts` 2/2 |
| Schema currency | 12 migrations applied; 50 base tables | `db:verify` PASS (2026-11-22) |

## 2. New module: synthetic employees (S1–S5)

Chain: `EmployeesPage.tsx` (badges, warning notice, filters, distribution bars, sync history) → shared `EmployeeSummary`/`EmployeesSummary`/`SYNTHETIC_EMPLOYEE_SOURCE` contracts → `GET /api/v1/employees*` (`employees.read`, scope) → Prisma `employees` + `org_references` → PostgreSQL.

- Seed: `employees:seed-synthetic` — idempotent single transaction; 60 profiles WS-EMP-0001+, 5 home stations, 30 org references **all UNCONFIRMED**; example.invalid emails; no NIK/personal contacts; **no login accounts created** (psql: 0 `users.employee_id` links).
- Firewall: employee Excel import **rejects SYNTHETIC codes** ("sumber lain") — test data cannot enter through the real import path (integration-verified).
- Cleanup: `employees:purge-synthetic` — FK-safe, verified live.
- Honesty: UI badges SYNTHETIC as warning + permanent notice that these are test profiles, not real KCIC employees.
- Evidence: live browser verification through the real API (list/filters/detail/summary), integration suites green, [`SYNTHETIC_EMPLOYEE_REPORT.md`](SYNTHETIC_EMPLOYEE_REPORT.md).

## 3. New module: accommodation research (R1–R7)

Chain: `ResearchPage.tsx` (list/filters/compare/detail/review panel) → shared `ResearchItem`/`ResearchSummary` + classification/status enums → `apiRequest` → `/api/v1/research*` (`research.read`; mutations `research.manage`, SYSTEM_ADMIN only) → service rules + `$transaction` → Prisma `accommodation_research` / `research_sources` / `research_events` → PostgreSQL (FKs to existing `Location`, `Dormitory`, `User` — **no duplicate masters**) → envelope → query invalidation + UI confirmation.

- **Promotion rule enforced server-side:** only `VERIFIED_OFFICIAL_KCIC` + `APPROVED` may promote; public lodging promotion → 400 with explicit policy message; promotion creates a property-level Dormitory only — **zero buildings/floors/rooms/beds fabricated** (integration asserts `_count = 0`); promoted records locked against reject/reclassify/re-promote (409).
- **Review trail:** approve/reject/classification changes require notes where mandated, write `research_events` (from/to status, actor) **and** append-only audit (`RESEARCH_APPROVE/REJECT/CLASSIFICATION_CHANGE/PROMOTE`).
- **Import:** `research:import` — validated, transactional, idempotent (36 inserted → 0 inserted/36 updated on rerun); administrator decisions never overwritten; refuses test/e2e/production URLs.
- **RBAC additive only:** `research.read`/`research.manage` granted via idempotent migration INSERTs (63 permissions / 214 grants); existing roles untouched; dev DB never re-seeded.
- Evidence: `research.test.ts` 6/6 (filters, detail, review, classification, promotion guards, RBAC 401/403); live browser verification of list/detail/compare/review panel/promote-disabled state; [`ACCOMMODATION_RESEARCH_REPORT.md`](ACCOMMODATION_RESEARCH_REPORT.md).

## 4. End-to-end regression evidence (executed 2026-11-22, current code)

| Check | Result |
|---|---|
| `npm run typecheck` (shared + API + web) | exit 0 |
| `npm run lint` (root ESLint) | exit 0, no findings |
| `npm run build` (production, all workspaces) | exit 0; web main chunk 430.18 kB / gzip 130.72 kB; ResearchPage split chunk 19.68 kB |
| Unit (`vitest.unit.config.ts`) | 7 files / **53/53 passed** |
| Integration (`vitest.integration.config.ts`, real `whoosh_stay_test`) | 21 files / **116/116 passed** |
| E2E (Playwright chromium, isolated `whoosh_stay_e2e`, ports 4001/5175) | **91/91 passed (12.7 min)** — auth, a11y (axe WCAG 2.1 A/AA), brand, crew flows, employee-import, gallery, management, master-data-access, master-import, profile-telegram, RBAC, responsive-audit (34), responsive, sidebar-navigation, sidebar |
| `npm run db:verify` (dev) | PASS — 50 tables, btree_gist, EXCLUDE constraint, append-only audit trigger, partial unique indexes, 12 migrations, roles=8 / permissions=63 / users=14 |
| Live API smoke (admin password session) | login 200; `/dashboard/overview` real counts; `/dashboard/operations` true zeros |
| Live browser (dev, password session) | employees + research pages verified through the real API |

No test was skipped, deleted or weakened; no security control was disabled to obtain these results.

## 5. Integration status summary (honest)

- **Real and running:** PostgreSQL 16 (Docker 5433), MinIO (9110/9111), password auth + scrypt, session cookies, RBAC, audit, all operational modules, Excel import/export, research layer.
- **Mock, labelled:** HR sync, roster sync, email/Telegram delivery — flags `false`/MOCK in `.env`, honest UI badges; prepared SMTP/Telegram/HTTP-sync adapters (D-053) ship inactive, and no external call is claimed.
- **Blocked by stakeholder:** official KCIC OIDC issuer/client/secret; real HR/roster contracts; official evidence for any KCIC-owned accommodation (0 classification-B records exist).
- **Not executed:** hosted CI run, production deploy, 100-VU load test (see `IMPLEMENTATION_STATUS.md` §5 for the full caveat list).