# Final Regression Report — WHOOSH STAY

**Date:** 2026-11-22 · **Phase:** 10 (full regression after the finalization, synthetic-employee, accommodation-research, management-IA-consolidation, dev-demo-dataset and external-adapter/D-053 batches)
**Rule honoured:** "Do not hide or skip failing tests to achieve a green result." / "Jangan menghapus test existing untuk mendapatkan hasil PASS" — no test was skipped, deleted, renamed away or weakened; no security control was disabled.

---

## 1. Environment

| Component | Value |
|---|---|
| Operational dev DB | `whoosh_stay` (PostgreSQL 16, Docker `whoosh-stay-postgres`, port 5433), `AUTH_MODE=password` |
| Integration DB | `whoosh_stay_test` — migrated + seeded automatically by vitest global-setup (isolated fixture) |
| E2E DB / servers | `whoosh_stay_e2e` — API 4001 + web 5175 auto-started by Playwright `webServer` (`npm run dev:e2e`) |
| Toolchain | Node 24, npm workspaces, Prisma 6.19.3, Express 5, React 19, Vite, Tailwind v4, TanStack Query 5, zod 4 |

## 2. Executed checks and actual results

| # | Check | Command (workspace) | Result |
|---|---|---|---|
| 1 | TypeScript | `npm run typecheck` (root → shared, api, web) | **exit 0** — all three workspaces |
| 2 | Lint | `npm run lint` (root `eslint .`) | **exit 0** — no findings |
| 3 | Production build | `npm run build` (root → shared, api, web) | **exit 0** — main chunk 430.18 kB / gzip 130.72 kB; route-level splits incl. `ResearchPage` |
| 4 | Unit tests | `npm run test:unit` (`vitest.unit.config.ts`) | **7 files / 53 tests passed** (env 16, schemas 6, seed 7, auth types 8, SMTP provider 4, Telegram provider 5, HTTP employee provider 7) |
| 5 | Integration tests | `npm run test:integration` (`vitest.integration.config.ts`, real `whoosh_stay_test`) | **21 files / 116 tests passed** — includes `research.test.ts` 6/6, employee-import 5/5, master-import 6/6, locations 6/6, auth-password 8/8, auth-telegram 2/2, reservations lifecycle/concurrency, RBAC denials, audit assertions |
| 6 | E2E full suite | `npm run test:e2e` (Playwright chromium) | **91/91 passed (12.7 min, exit 0)** — latest run incl. the D-053 `profile-telegram` spec: auth 5, a11y 4, brand 3, crew 3, employee-import 2, gallery 2, management 4, master-data-access 8, master-import 2, profile-telegram 1, rbac 2, responsive-audit 34, responsive 9, sidebar-navigation 8, sidebar 4. Supersedes the earlier 90/90 (13.0 min) and 89/89 (12.7 min) runs. Historical note: the one interim failure (stale "Auth login" label after `/manage/audit` began redirecting to the Users audit tab) was corrected in the test to assert the tab's actual content (`AUTH_LOGIN` cell), then the full suite was rerun green |
| 7 | DB verification | `npm run db:verify` (dev) | **all checks passed** — 50 base tables; btree_gist; `bed_allocations_no_overlap` EXCLUDE; append-only audit trigger; partial unique indexes (role assignment, reservation idempotency, one active QR); 12 migrations applied (latest `20261122150000_user_telegram_chat_id`); seed roles=8 / permissions=63 / users=14 |
| 8 | Live API smoke | admin password login + dashboard endpoints | login **200**; `/dashboard/operations` queried live from PostgreSQL against the labelled dev demo dataset: reservations **12**, beds **150**, occupied **2**; figures not hardcoded |
| 9 | Live browser verification | dev web (password session) | Sidebar without Log Audit/Pengaturan/Data Karyawan; users settings tab; Master Data → Data Karyawan embedded view (SYNTHETIC badges/notice); gallery with 160 distinct synthetic demo photos; 24 management + 11 crew routes rendered; demo crew session showed upcoming and active stays |
| 10 | Zero-demo static sweep | grep over `apps/web/src` | 57 matches, **all classified** as mock-gated labels, no-op normalizers, identifiers, transparency badges or import-preview rows; 0 `dummy`/`fake`/`data palsu` (see [`ZERO_DEMO_UI_AUDIT.md`](ZERO_DEMO_UI_AUDIT.md)) |
| 11 | Research import idempotency | `npm run research:import` ×2 | run 1: 36 inserted / 65 sources; run 2: **0 inserted / 36 updated** / 65 sources; admin decisions preserved |

## 3. Accessibility, responsive and RBAC coverage (within the E2E run)

- **axe WCAG 2.1 A/AA** clean on login, 11 crew routes, 18 management routes and an open modal; keyboard focus trap / Escape / focus restore verified (a11y 4/4).
- **Responsive audit:** 11 crew + 18 management routes at 360/390/768/1024/1280/1440 — 34/34, zero unfixed viewport offenders; sidebar usable at 1920 and zoom-equivalent 720–3840 CSS px.
- **RBAC:** housekeeping sees only permitted navigation; dormitory manager sees scoped administration but not settings; direct URLs stay server-guarded (403); research mutations denied for crew/manager (integration).

## 4. Database end-state after regression (dev, psql-verified)

locations 5 · employees 60 SYNTHETIC + 1 DEMO crew employee (0 SYNTHETIC login accounts) · org_references 30 (all UNCONFIRMED) · dev demo dataset: dormitories 5 / rooms 30 / beds 150 / reservations 15 / photos 160 (all explicitly `DEMO`/"(data uji)"/"(foto demo sintetis)") · accommodation_research 36 (29 VERIFIED_PUBLIC / 7 RESEARCH_CANDIDATE / 0 VERIFIED_OFFICIAL_KCIC; all PENDING, 0 promoted) · research_sources 65 · permissions 63 / role_permissions 214 · users 14 (1 ACTIVE admin + 1 ACTIVE demo crew + 12 DISABLED) · audit_logs 1,126 (append-only intact).

The dev database was never re-seeded, truncated or dropped; all schema changes were additive migrations; RBAC grants went through idempotent migration INSERTs. The demo dataset is removable with `purge:demo`.

## 5. Caveats (unchanged, honest)

- E2E/integration run on isolated fixture databases; the dev operational DB holds the verified base plus the explicitly labelled dev demo accommodation dataset (§2c of `DATA_READINESS.md`) — not KCIC operational data.
- Performance figures in `IMPLEMENTATION_STATUS.md` §3 are local single-user measurements — **not** a 100-VU load test; hosted CI and production deploy remain unexecuted.
- External integrations (OIDC, HR, roster) stay MOCK/BLOCKED; SMTP email, Telegram and HTTP employee sync have prepared adapters (D-053) but are shipped inactive (no credentials configured), so deliveries remain `MOCK_DELIVERED` and sync stays DISABLED/MOCK. Nothing external is claimed.

**Conclusion:** the full regression is green on the current code with every check actually executed and recorded. The system is ready for real data population through the validated import paths, pending legitimate sources and the stakeholder decisions listed in `IMPLEMENTATION_STATUS.md` §7.