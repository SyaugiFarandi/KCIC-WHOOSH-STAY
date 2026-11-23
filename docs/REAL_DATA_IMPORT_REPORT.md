# Real Data Import Report — WHOOSH STAY

**Date:** 2026-11-22 · **Policy:** REAL OPERATIONAL DATA FINALIZATION & ZERO DEMO UI brief · **Decision record:** D-048/D-049/D-050
**Companion docs:** [`DATA_READINESS.md`](DATA_READINESS.md) · [`INTEGRATION_MAP.md`](INTEGRATION_MAP.md) · [`ACCOMMODATION_RESEARCH_REPORT.md`](ACCOMMODATION_RESEARCH_REPORT.md) · [`SYNTHETIC_EMPLOYEE_REPORT.md`](SYNTHETIC_EMPLOYEE_REPORT.md)

> **Bottom line:** no legitimate operational source file (HR export, facility master, rate card, photo archive) has been provided by the user's team. **Nothing real was imported because nothing real was available — and nothing was fabricated to fill the gap.** Every validated import path is built, tested and ready. The only data committed beyond the team-verified location master is explicitly labelled non-operational data (SYNTHETIC test employees, public research candidates), each governed by its own brief and honesty rules.

---

## 1. What is actually in the operational database (psql-verified 2026-11-22)

| Data | Count | Origin / label | Operational? |
|---|---|---|---|
| Locations | 5 | HALIM, KARAWANG, PADALARANG, TEGALLUAR, DEPO-501 — explicitly provided by the user's team; seeded idempotently; addresses NULL ("Belum diverifikasi") | Yes — team-verified master |
| Roles / permissions / grants | 8 / 63 / 214 | Application RBAC definition (additive `research.read`/`research.manage` via migration, never re-seeded) | Application config |
| Admin account | 1 ACTIVE | `admin@whoosh-stay.local`, bootstrap-created; password rotated 2026-11-21 (stored outside the repo, never printed in reports) | Operator access |
| Demo accounts | 12 DISABLED | Isolated during D-050 purge: null credential hashes, no roles, no sessions; kept only for append-only audit integrity | No — cannot authenticate |
| Employees | 60 | **All `sourceSystem='SYNTHETIC'`** (WS-EMP-0001+), example.invalid emails, no NIK/personal contacts, **0 login accounts** (verified: no `users.employee_id` references them). UI badges them as test data with a permanent warning notice | **No — labelled test data** |
| Org references | 30 | Departments/divisions/positions created by the synthetic seed, **all `UNCONFIRMED`** — never presented as KCIC's real org chart | No — unconfirmed placeholders |
| Research candidates | 36 | Public-web accommodation research per location; 29 `VERIFIED_PUBLIC`, 7 `RESEARCH_CANDIDATE`, **0 `VERIFIED_OFFICIAL_KCIC`**; all 36 `PENDING`, **0 promoted** | **No — research layer, not operational master** |
| Research sources | 65 | URLs + check dates (2026-11-22); 19 official property sites; all `photoUrl` null (no image with verified usage rights found) | Provenance metadata |
| Dormitories / buildings / rooms / beds | 0 / 0 / 0 / 0 | Honest empty state — no facility hierarchy invented | Awaiting verified source |
| Reservations / allocations / stays | 0 | True zeros; dashboard KPIs computed from these zeros | Awaiting real activity |
| Photos / MinIO objects | 0 | Demo imagery purged (361 objects); no copyrighted scraping | Awaiting real photographs |
| Employee import batches | 0 | No real Excel import has been committed | — |
| Audit logs | 1,114 | Append-only, trigger-protected, preserved through every operation | Immutable history |

## 2. Import paths — built, tested, ready for real sources

| Path | Entry points | Validation | Test evidence |
|---|---|---|---|
| Employee Excel import (D-048) | `GET /api/v1/employees/import-template` (generated XLSX with field guide) → `POST …/import/preview` → `POST …/import/:batchId/commit` | multer 2 MB + ZIP magic; exact header contract; per-row zod; intra-file duplicate + cross-source conflict checks; homeStation must match ACTIVE Location; PREVIEWED-only commit, 409 on repeat; single `$transaction` re-validates every row; upsert by `(sourceSystem='IMPORT', externalEmployeeId)`; batch/row history + audit | `employees-import.test.ts` 5/5; E2E `employee-import.spec.ts` 2/2 |
| Accommodation Excel import (D-049) | `GET/POST /api/v1/master-data/import-template|preview?entity` → `POST …/import/:batchId/commit` (dormitories/buildings/rooms/beds) | Parents must already exist — **no auto-invention of hierarchy**; dormitory `locationCode` must be ACTIVE; UPDATE never touches operational/housekeeping status, eligibility, capacity, address, contacts, coordinates; one `$transaction` (60 s), skipped rows marked INVALID with reasons | `master-import.test.ts` 6/6; E2E `master-import.spec.ts` 2/2 |
| Master-data forms | `/manage/master-data` CRUD (room types, facilities, buildings, rooms, beds, locations) | Server-side zod + permission + GLOBAL guard where required; duplicate codes 409; deactivation blocked while ACTIVE children linked; every mutation audited | `locations.test.ts` 6/6; master-data suites; E2E 8/8 |
| Research import | `npm run research:import` (reads `research/raw/*.json`) | Enum/length/date validation; locations must exist; single transaction; **idempotent** (run 1: 36 inserted/65 sources; run 2: 0 inserted/36 updated); administrator decisions (review status, promotion) never overwritten; refuses test/e2e URLs and production | `research.test.ts` 6/6; two live runs verified |
| Synthetic employee seed | `npm run employees:seed-synthetic` / `employees:purge-synthetic` | Idempotent transactional seed; FK-safe purge; **import rejects SYNTHETIC employee codes** ("sumber lain") so test data can never enter through the real import path | Seed/purge verified live; rejection covered by integration |

**Guardrails that keep imports honest:** invalid rows are never committed and remain visible per-row with reasons; no import creates identities, facilities, addresses or rates that the source file does not contain; every commit is audited with batch provenance; the SYNTHETIC source is firewalled from the IMPORT path.

## 3. External sync adapters — honestly labelled, not claimed

| Adapter | State | Evidence |
|---|---|---|
| HR employee sync | MOCK, `EMPLOYEE_SYNC_ENABLED=false` | UI badge "Sync: MOCK"; sync-run history shows adapter source; no external call claimed |
| Duty roster sync | MOCK_ROSTER, `ROSTER_SYNC_ENABLED=false` | Labelled in UI; never mutates confirmed reservations |
| Email / Telegram delivery | MOCK | Delivery log records MOCK statuses; nothing leaves the system |
| KCIC SSO (OIDC) | Real adapter implemented, **BLOCKED** | Official issuer/client/secret not supplied; nothing invented; production refuses mock auth |

## 4. What unblocks real population

1. **Verified HR export or employee Excel** (codes, names, departments, positions, home stations) → employee import path; replaces SYNTHETIC profiles via the official import (purge CLI available for clean removal).
2. **Verified facility master** (dormitories/buildings/rooms/beds with real capacities) → accommodation import or master-data forms. Research candidates **cannot** become operational facilities unless KCIC officially proves ownership/contract (classification B) and an administrator approves + promotes — enforced server-side.
3. **Real accommodation photographs** with usage rights → gallery upload (MinIO, API-only streaming).
4. **Official KCIC answers** to the per-location data requests in [`ACCOMMODATION_RESEARCH_REPORT.md`](ACCOMMODATION_RESEARCH_REPORT.md) §3 — starting with the meaning of code DEPO-501 and whether crew rest buildings exist at Depo Tegalluar.
5. **Location addresses** from a verified source (currently NULL by design).

No passwords, credential hashes or secrets appear in this report. No completeness claim is made without a cited source or executed check.