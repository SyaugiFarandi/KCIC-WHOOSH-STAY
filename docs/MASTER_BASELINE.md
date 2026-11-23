# WHOOSH STAY — Master Baseline & Data Inventory (Phase 0–2)

Date: 2026-11-21. All counts below come from live queries against the development PostgreSQL database (port 5433) and repository inspection — no estimates.

## 1. Baseline report

| Area | Kondisi existing | Temuan | Risiko | Rekomendasi |
|---|---|---|---|---|
| Frontend | React 19 + Vite (port 5174) + Tailwind v4 `@theme` + TanStack Query 5 + react-router 7; route-level code splitting; shared UI kit `apps/web/src/components/ui.tsx` | Some pages lacked error states (fixed in this pass: CrewHome, CrewBooking, CrewSearch, FrontDesk pending); raw hex colors mostly tokenized | Silent failures mislead users | Keep ErrorState/EmptyState/Skeleton discipline on every query |
| Backend | Express 5 (port 4000), modular routers `apps/api/src/modules/*`, Zod validation, Prisma 6, scope builders `lib/scope.ts`, append-only audit | List/summary scope divergence prevented via extracted builders (D-043); `statuses` filter added additively (D-045) | Scope drift if filters duplicated | Reuse scope builders for every new endpoint |
| Database | PostgreSQL 16 (Docker, 5433), Prisma schema 40+ models, migrations incl. btree_gist exclusion constraint on bed allocations | No Location master model — dormitories carry only `stationCode` | Master lokasi cannot be referenced relationally | Add `Location` model + optional `Dormitory.locationId` (Phase 3) |
| Authentication | Password + server sessions (cookie), dev-login gated to development; production mode refuses mock auth (tested) | 12 demo accounts, all `@demo.whoosh-stay.local` | Demo accounts must never exist in production | Bootstrap admin flow; keep production refusal (Phase 6/14) |
| RBAC | 8 roles, 58 permissions, scope types GLOBAL/DORMITORY/BUILDING/ASSIGNED_TASK/SELF; backend enforcement on every route | Demo housekeeping/maintenance accounts are DORMITORY-scoped (seed) | New modules need new permissions without altering existing grants | Additive permissions only (e.g. `locations.read/manage`) |
| UI/UX | Premium railway-hospitality direction; sidebar #8B1A1A; audit documented in `UI_UX_REDESIGN.md` (H/M/L findings) | HIGH findings H1–H5 all fixed; MEDIUM mostly fixed; M12/M14 refactors deferred | Refactors risk regression | Defer M12/M14; validate via Playwright |
| Design system | Central tokens `styles.css` (brand/sand/ink/gold/chart), UI kit components, Plus Jakarta Sans Variable; UI/UX Pro Max primary, Hallmark reviewer (D-046) | Hallmark marketing-page gates conflict with enterprise density — waived on record | Two conflicting visual systems | Conflict resolution per D-046; tokens unchanged |
| Data | 100% of operational records are DEMO (see inventory); employee adapter MOCK; roster adapter development | No real operational data exists yet | Demo data mistaken for real | Phase 13 separation plan; USER-PROVIDED import paths (Phase 5/7) |
| API integration | All pages read/write via `/api/v1` → Prisma → PostgreSQL; no frontend-only operational storage; summary endpoints added (D-043) | Employee/roster sync still development adapters (declared MOCK in UI) | Fake integration claims | Keep MOCK badges; never simulate official KCIC integration |
| Testing | Vitest unit + 13 integration files (test DB `whoosh_stay_test`) + Playwright E2E (responsive widths, sidebar, flows); typecheck/lint/build green at baseline | Responsive batches 720–2880 px not yet re-run after latest edits | Unverified zoom widths | Run remaining batches in final regression (Phase 15) |

## 2. Data inventory (live DB counts, 2026-11-21)

| Data | Lokasi sumber | Jumlah | Status | Tindakan |
|---|---|---:|---|---|
| Users | `users` (seed `apps/api/src/database/seed.ts`) | 12 | DEMO (all `@demo.whoosh-stay.local`; 2 DISABLED) | Keep for dev; production bootstrap admin (Phase 6); no auto-delete |
| Roles / Permissions / UserRoles | seed | 8 / 58 / 13 | SYSTEM CONFIGURATION | Preserve; additive permissions only |
| Sessions | runtime | 847 | SYSTEM (runtime) | Ephemeral; expiry handles cleanup |
| System settings | seed | 7 | SYSTEM CONFIGURATION | Preserve |
| Employees | seed + employee sync adapter | 110 | DEMO (`sourceSystem=DEMO` on all 110) | Excel import path (Phase 5) writes `sourceSystem=IMPORT`; demo purge needs approval (Phase 13) |
| Employee sync logs | adapter runs | 1 | DEMO | Keep as history |
| Dormitories | seed | 5 | DEMO (names `DEMO Dormitory … (fiktif)`, codes `DEMO-*`) | Link to Location master; real buildings/rooms only from user input (Phase 4/7) |
| Buildings / Floors / Room types / Rooms / Beds | seed | 5 / 10 / 2 / 34 / 158 | DEMO | Same separation plan as dormitories |
| Facilities / room links | seed | 3 | DEMO (unverified facility claims) | Real facilities only from verified input |
| Reservations / guests / allocations / events | seed + E2E runs | 230 / 230 / 189 / 461 | DEMO + TEST-generated | Never fabricate more; purge plan requires FK analysis + approval |
| Check-ins / check-outs / QR tokens | seed + runs | 106 / 91 / 0 | DEMO | Same plan |
| Housekeeping tasks / maintenance tickets | seed + runs | 15 / 10 | DEMO | Only real work orders going forward |
| Roster assignments / sync runs | development adapter | 50 / 0 | DEMO (UNVERIFIED source adapter) | Keep MOCK labeling; official integration blocked on credentials |
| Notifications / deliveries | runtime from demo events | 80 / 1 | DEMO-derived | Purge with parent demo data after approval |
| Attachments / accommodation photos | demo upload + generated images | 1 / 180 | DEMO (generated illustrations, labeled DEMO in UI) | Never claim as actual facility photos; real photos via MinIO upload (Phase 9) |
| Audit log | runtime | 996 | SYSTEM (append-only) | NEVER purge — audit integrity |
| Integration exceptions | runtime | 0 | SYSTEM | — |
| Test fixtures | `apps/api/test/**`, seed for `whoosh_stay_test` | n/a | TEST FIXTURES | Isolated test DB; never mixed into operational dataset |
| Frontend hardcoded data | none found in production paths (KPIs now from summary APIs, D-043) | 0 | — | Keep zero |

Categories used: REAL VERIFIED DATA (none yet), USER-PROVIDED DATA (the five location names/codes from the master brief), UNVERIFIED DATA (none ambiguous — everything is explicitly DEMO-labeled), DEMO DATA (all operational rows above), TEST FIXTURES (test DB only), SYSTEM CONFIGURATION (roles/permissions/settings/audit).

## 3. Key decisions pending user approval (Phase 13)

All demo operational records are interlinked (reservations → allocations → checkins → housekeeping → notifications → audit). No deletion will be executed without:
1. `pg_dump` backup + documented rollback.
2. FK/transaction analysis per table.
3. Explicit user decision on the demo dataset (archive vs delete vs keep dev-only).

Interim safe state: demo data remains in the development database, clearly labeled DEMO in every UI; production mode already refuses demo authentication and mock adapters. Real data enters only through the import/CRUD paths built in Phases 3–7.

## 4. Skill baseline

- UI/UX Pro Max: installed `C:\Users\muhammad.farandi\.qoder\skills\ui-ux-pro-max` — PRIMARY design system (unchanged).
- Hallmark v2.0.0: installed `C:\Users\muhammad.farandi\.qoder\skills\hallmark` (skills.sh `nutlope/hallmark@hallmark`, pinned client) — REVIEW/QC only; static sloplint verified working; see D-046 for split, waivers, and conflict resolution.