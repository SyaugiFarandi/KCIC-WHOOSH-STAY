# Data Readiness Report — WHOOSH STAY

**Date:** 2026-11-22 · **Policy:** REAL DATA POPULATION & ZERO DEMO/DUMMY brief §§1–8 · **Decision record:** D-050

Status vocabulary (per brief §7): **VERIFIED** (source known and checked) · **IMPORTED** (committed through a validated import path) · **ISOLATED/PURGED** (demo data safely removed or neutralized after audit + backup) · **NOT AVAILABLE** (no legitimate source exists yet — honest empty state) · **FAILED** (an attempted operation did not succeed).

---

## 1. VERIFIED — real data currently in the operational database

| Data | Count | Source / verification |
|---|---|---|
| Locations | 5 | HALIM, KARAWANG, PADALARANG, TEGALLUAR, DEPO-501 — explicitly provided by the user's team (master brief Phase 3). Seeded idempotently by code; addresses intentionally NULL ("Belum diverifikasi") because no verified address source exists. |
| Roles | 8 | SYSTEM_ADMIN, DORMITORY_MANAGER, DORMITORY_ADMIN, FRONT_DESK, HOUSEKEEPING, MAINTENANCE, CREW, AUDITOR — application RBAC definition, not operational data. |
| Permissions | 63 | Application permission catalog (214 role grants). Additive `research.read`/`research.manage` granted via idempotent migration INSERTs — existing roles untouched, dev DB never re-seeded. |
| System settings | base | Application policy keys (e.g. `reservation.defaultApprovalMode`); D-008 readiness window still pending stakeholder decision. |
| Admin account | 1 | `admin@whoosh-stay.local`, GLOBAL SYSTEM_ADMIN, created via `bootstrap-admin.ts` (scrypt-hashed). Password **rotated 2026-11-21** via `rotate-admin-password.ts`; the new secret is stored outside the repo and never printed in reports. Not a KCIC identity; operator should bootstrap their own email for real use. |
| Audit history | 1,114+ | Append-only log preserved intact through the purge and all later batches (trigger-protected). |

## 2. IMPORTED — none

No legitimate operational source file (Excel/CSV/JSON/SQL/HR export/configured API) was provided or found in the repository audit. **Nothing was fabricated to fill the gap.** The validated import paths are built, tested and ready for real sources:

- Employee Excel import (D-048): template → preview with per-row validation → confirm → single-transaction commit → history. `sourceSystem='IMPORT'`, duplicate-safe upsert by employee code.
- Accommodation Excel import (D-049): dormitories, buildings, rooms, beds — parent references must already exist; no auto-invention of hierarchy.
- Master data forms (Phase 10): administrators can input verified facilities directly; every mutation validated server-side and audited.
- Employee/roster sync adapters: currently MOCK (labelled honestly in the UI). Real HR/roster integration awaits official contracts and credentials; sync flags are `false` in `.env`.

### 2b. Labelled NON-OPERATIONAL data added after the purge (not real imports)

Two later briefs added explicitly labelled test/research data. Neither is operational KCIC data, and neither was disguised:

| Data | Count | Label / safeguards |
|---|---|---|
| Synthetic employees (S1–S5) | 60 | All `sourceSystem='SYNTHETIC'` (WS-EMP-0001+), example.invalid emails, no NIK/personal contacts, **0 login accounts**; 30 org references all `UNCONFIRMED`. UI warning badges + permanent notice ("data uji … bukan karyawan KCIC sungguhan"). Excel import **rejects SYNTHETIC codes**; FK-safe purge CLI (`employees:purge-synthetic`) ready. See [`SYNTHETIC_EMPLOYEE_REPORT.md`](SYNTHETIC_EMPLOYEE_REPORT.md). |
| Accommodation research candidates (R1–R7) | 36 + 65 sources | Public-web research per location: 29 `VERIFIED_PUBLIC`, 7 `RESEARCH_CANDIDATE`, **0 `VERIFIED_OFFICIAL_KCIC`**; all `PENDING`, **0 promoted**. Lives in a separate research layer (`accommodation_research`/`research_sources`/`research_events`), never in operational masters. Promotion to a Dormitory requires classification B + administrator approval, enforced server-side; no building/room/bed hierarchy fabricated. See [`ACCOMMODATION_RESEARCH_REPORT.md`](ACCOMMODATION_RESEARCH_REPORT.md). |

### 2c. Development demo accommodation dataset (dev database only)

Added 2026-11-22 on explicit user request ("buatkan dan isikan data tampilan penginapan dengan foto yang berbeda, dan semua flow berjalan") so every UI flow can be exercised with real PostgreSQL data in the dev environment. It is **explicitly labelled test data**, not KCIC operational data:

| Data | Count | Label / safeguards |
|---|---|---|
| Demo dormitories | 5 | Codes `DEMO-DORM-01…05`, names "DEMO Dormitory <area> (data uji)", description "DATA UJI / SIMULASI…", address "DEMO — alamat fiktif". Linked to the 5 verified location master rows only as a scope reference. |
| Buildings / floors / rooms / beds | 5 / 10 / 30 / 150 | `DEMO-*` codes, room names "(data uji)"; 2 demo room types + 3 demo facilities. |
| Photos | 160 (5 dormitory sets + 30 room sets) | Locally generated synthetic imagery stored in MinIO; captions end with "(foto demo sintetis)". **No scraped or copyrighted photos.** Remove with `purge:demo`. |
| Reservations / stays | 15 | Booking prefix `DEMO-ACC-RSV-`, `sourceReference='DEMO_ACCOMMODATION_V1'`; statuses 6 CHECKED_OUT, 3 CHECKED_IN, 3 CONFIRMED, 1 PENDING_APPROVAL, 1 CANCELLED; guests are SYNTHETIC employees or the demo crew employee. |
| Demo crew account | 1 | `crew.demo@demo.whoosh-stay.local`, role CREW (SELF scope), linked to employee "DEMO Crew Pengujian" (`sourceSystem='DEMO'`). Random password written to `.secrets/demo-crew-password-*.txt` and never printed in logs/reports. |

The seed is `apps/api/src/database/seed-dev-demo.ts` (`npm run demo:seed -w @whoosh/api -- --confirm`). Safeguards: throws in production; refuses any database whose name is not exactly `whoosh_stay` (never test/e2e); dry-run by default; idempotent upserts by `DEMO-*` codes and booking codes; creates no permissions, roles, or settings. `purge:demo` understands these codes/prefixes and removes the rows plus MinIO objects.

## 3. ISOLATED / PURGED — demo data removed from the operational database

Executed by `apps/api/src/database/purge-demo.ts --execute` after a verified backup and restore drill (D-050):

- **Backup / rollback point:** `backups/whoosh_stay-20261121T164157Z.dump` — 402,310 bytes, SHA-256 `42a5f65833b37a211a7f175441a35d893d148419bc6bdeb19876dfe0d62733dd`. Restore drill passed (46 tables, 1,475 rows, 9 migrations, append-only trigger intact).
- **Origin gate:** the purge aborts if any non-demo operational row exists; it refuses test/e2e database URLs. Everything deleted was verified `DEMO`-origin seed data — no production or unknown-origin data was touched.
- **Deleted (single transaction, FK order):** 230 reservations, 189 bed allocations, 15 housekeeping tasks, 10 maintenance tickets, 1 inventory block, 1 attachment, 180 photos, 80 notifications, 1 delivery, 50 roster assignments, 1 sync log, 158 beds, 34 rooms, 10 floors, 5 buildings, 5 dormitories, 2 room types, 3 facilities, 1 policy, 110 employees, 13 role assignments, 910 sessions. MinIO: 361 demo objects removed (0 failures).
- **Isolated (not deleted): 12 demo user accounts.** The append-only audit trigger forbids deleting users referenced as audit actors (`ON DELETE SET NULL` would UPDATE audit rows → `42501`). They are now `DISABLED`, with null password hashes, no roles and no sessions — unable to authenticate, holding no access. They remain visible in Users & Access as Disabled records for audit traceability. Final disposal is a stakeholder decision after audit review.
- **Verified end state (psql):** employees 0, dormitories 0, rooms 0, beds 0, reservations 0; locations 5, roles 8, audit logs intact.

## 4. NOT AVAILABLE — awaiting legitimate sources (honest empty states, true zeros)

| Domain | Current state | What unblocks it |
|---|---|---|
| Employees / crew identities | 0 operational rows; 60 labelled SYNTHETIC test profiles + 1 demo crew employee (§2b/§2c) | Verified HR export or Excel import (employee codes, names, departments, positions, home stations). No fictitious identities presented as real; SYNTHETIC profiles carry no login accounts and are replaceable via the official import. |
| Dormitories / buildings / rooms / beds | 5 labelled DEMO dormitories (30 rooms, 150 beds) in the dev database only (§2c); 0 operational rows | Verified facility survey/master file, or administrator input via forms/import. Research candidates (§2b) cannot become operational facilities without official KCIC evidence + administrator approval; DEMO rows are removed by `purge:demo` before operational go-live. |
| Photos / gallery | 160 synthetic demo images in the dev database only (§2c); 0 operational photos | Real accommodation photographs uploaded by administrators (MinIO-backed). No copyrighted scraping. |
| Reservations / stays / transactions | 15 labelled DEMO reservations in the dev database only (§2c); 0 operational rows | Real crew bookings after employees + facilities exist. No fake transactions presented as operational KPI history. |
| Roster assignments | 0 rows | Official roster contract/credentials (adapter currently MOCK, labelled). |
| Real SSO / HR integration | Not connected | Official KCIC OIDC issuer/client/secret and HR API contracts. Nothing invented; production refuses mock auth. |
| Location addresses | NULL ("Belum diverifikasi") | Verified address source per location. |

## 5. FAILED — none

No import, sync, purge or bootstrap operation failed in the final execution. (Earlier attempted runs that hit the append-only audit constraint were rolled back by their transactions and re-designed as isolation before the successful commit — no partial state was left behind.)

## 6. Acceptance checklist (brief §8)

- [x] No dummy/sample data presented as actual operational data — operational masters hold verified records only; every demo/synthetic row carries a `DEMO`/`SYNTHETIC` code and a visible "(data uji)" or synthetic notice, and lives only in the development database.
- [x] No Demo menu, Demo Mode, "Sample Data"/"Dummy Data" text in password/OIDC sessions — demo *env* labels remain gated to the mock fixture (`useIsDemoEnv`), while the dev demo dataset is labelled through DATA, not a demo switch: `DEMO-*` codes, "(data uji)" names/captions, and the SYNTHETIC employee notice; 15-page live management sweep + 35-route browser sweep found no unlabelled demo text.
- [x] Operational data traceable — locations traceable to the team-provided master; imports carry batch/row provenance; every mutation audited; demo dataset documented here with its password-free cleanup path.
- [x] CRUD connected to PostgreSQL — verified live (master data read, login/session, dashboard aggregates, employees + research pages, gallery photos, reservations) and by 116 integration tests + 91 E2E tests.
- [x] Dashboards compute actual data — occupancy = occupied beds / operational usable beds, now non-zero because the labelled dev demo dataset exists (3 checked-in stays); all figures still queried live from PostgreSQL, never hardcoded (live API check 2026-11-22).
- [x] Import + sync tested — employee import 5/5, master import 6/6, research import idempotent (36 inserted → 0 inserted/36 updated on rerun); sync adapters honestly labelled MOCK.
- [x] Nothing fabricated — no invented identities, facilities, addresses, transactions or credentials; synthetic test profiles and research candidates are explicitly labelled and firewalled from operational masters.
- [x] Demo removal safe — audit + backup + restore drill + origin gate + FK-ordered transaction + isolation instead of destructive deletion; rollback point preserved.

**Bottom line:** the system is an honest baseline: verified location master, secure rotated admin access, no operational rows presented as real, plus three explicitly labelled non-operational layers — SYNTHETIC test employees, public research candidates, and a development demo accommodation dataset with synthetic photos (§2c) — none of which can masquerade as KCIC operational data. "Lebih baik data kosong tetapi jujur daripada data lengkap tetapi fiktif." Operational population still requires legitimate sources from the user's team and official KCIC answers to the research data requests; every input/import path is ready and tested. Full evidence: [`REAL_DATA_IMPORT_REPORT.md`](REAL_DATA_IMPORT_REPORT.md), [`FINAL_REGRESSION_REPORT.md`](FINAL_REGRESSION_REPORT.md), [`ZERO_DEMO_UI_AUDIT.md`](ZERO_DEMO_UI_AUDIT.md), [`FULL_STACK_INTEGRATION_REPORT.md`](FULL_STACK_INTEGRATION_REPORT.md).