# Whoosh Stay — Technical Risks

**Date:** 2026-11-21
**Scope:** Risks to correctness, security, delivery and production readiness. Reviewed at every phase gate.

Likelihood: L/M/H. Impact: L/M/H/C (critical). Severity derives from both; critical/high require mitigation evidence before release.

---

## 1. Top risks (must be proven before Phase 3/4 gates)

| Rank | Risk | Why it matters | Required proof |
|---|---|---|---|
| 1 | Double allocation of the same bed | Direct business failure; corrupts occupancy and trust | Exclusion-constraint migration test + concurrent last-bed test (one 201, one 409) |
| 2 | RBAC/scope bypass (IDOR) | Employee data leakage; audit exposure | Route-registry deny-by-default test + per-role allow/deny matrix + object-level IDOR suite + export scope test |
| 3 | Readiness vs future-dated booking ambiguity | Either bookable dirty rooms or blocked future inventory | Configurable readiness window + check-in recheck; stakeholder decision D-008; tests for both sides of window |
| 4 | Roster sync duplicating or mutating confirmed bookings | Double reservations; silent changes to confirmed stays | Idempotent upsert tests, concurrent sync lock test, reconciliation test that confirmed bookings are untouched |
| 5 | QR token replay/leakage | Unauthorized check-in; PII exposure | Hash-only storage, TTL, single-use, rate limit, duplicate-scan concurrency test, log redaction test |

---

## 2. Risk register

| ID | Risk | L | I | Severity | Phase | Mitigation | Early warning |
|---|---|---|---|---|---|---|---|
| R-01 | Concurrent booking allocates same bed | M | C | Critical | 3 | `btree_gist` exclusion constraint on active/held allocations; deterministic row locks; serialization retry; map `23P01` to 409; concurrent tests | Any allocation count > 1 per bed/date in data-quality checks |
| R-02 | Scope or object-level authorization leaked via list/detail/export | M | C | Critical | 1–7 | Central registry with declared permission+scope; predicate builder reused by lists and exports; IDOR tests per entity; deny by default | Route added without permission metadata; test count of protected routes drops |
| R-03 | QR token guessed, replayed or logged | L | H | High | 4 | 32-byte random token, SHA-256 hash only, configurable TTL, single-use in transaction, rate limits, validation token (2 min) between validate and confirm | Any raw token in logs; duplicate confirm succeeding |
| R-04 | Readiness semantics wrong for future bookings | H | H | High | 3–4 | Configurable readiness window (proposed 24h); blocks/operational status always exclude; readiness rechecked at check-in; explicit decision record | Stakeholder reports future stays blocked by transient dirtiness, or dirty bed offered |
| R-05 | Bed-level readiness absent from documented schema | H | H | High | 1 | Add `beds.housekeeping_status` + reason; room status remains aggregate gate; migration test | Room clean but individual bed dirty cannot be represented |
| R-06 | Roster duplicates or silently overwrites confirmed reservations | M | H | High | 5 | Unique `(source_system, external_roster_id)`, payload hash, advisory lock per source, reconciliation that never mutates confirmed, default recommendation-only | Sync count growth on repeated fixture; confirmed booking `updated_at` changes unexpectedly |
| R-07 | Group check-in/out aggregate state ambiguous | M | M | Medium | 4 | Per-guest check-in/out records; reservation CHECKED_IN on first, CHECKED_OUT on last; explicit transition tests | Reservation checked out while a guest still active |
| R-08 | Timezone/date boundary defects | M | M | Medium | 1–4 | Date-only stays; UTC timestamptz storage; Asia/Jakarta conversion for blocks/display; boundary tests at 00:00 and 23:59 JKT | Off-by-one availability around block edges; check-in window rejects valid time |
| R-09 | OIDC/employee/roster contracts unavailable | H | H | High | 1, 5 | Adapter boundaries, deterministic mocks, feature flags disabled; production refuses mock auth; `describeRequiredInput()` surfaced in admin UI | Any attempt to invent endpoint/credential; integration enabled without config |
| R-10 | Availability query too slow at scale | M | M | Medium | 3, 7 | Indexes per schema; `NOT EXISTS` overlap query; pagination; EXPLAIN review; 100-VU baseline | p95 availability > 2 s; sequential scans on allocations |
| R-11 | Prisma schema drift vs raw SQL constraints | M | M | Medium | 1+ | Raw migrations for extension/constraint/trigger; `db push` banned in scripts; `db:verify` assertions in CI | Fresh migrate missing constraint; introspection diff |
| R-12 | Readiness dual sources (status vs inventory blocks) | M | M | Medium | 4 | Single write path: readiness status for housekeeping; blocks for time-bound maintenance/admin; precedence documented; services own transitions | Room shows READY with active maintenance block |
| R-13 | Notification failure rolls back or blocks booking | M | L | Medium | 3, 6 | Post-commit dispatch; delivery log rows; retry sweeper; failure injection test | Booking 500 when provider down |
| R-14 | Export leaks out-of-scope rows or formula injection | M | H | High | 6 | Same predicate builder as lists; per-row authorization; prefix sanitization of `= + - @`; filename/content disposition; scope tests | Export row count ≠ list count for same user |
| R-15 | Upload abuse (MIME spoof, oversized, unauthorized access) | M | M | Medium | 2, 4 | MIME sniff, extension allowlist, size cap, private bucket, short-lived signed URLs, entity authorization, malware-scan hook | Public bucket access; signed URL valid without auth context |
| R-16 | Audit incomplete or mutable | M | M | Medium | 1+ | Audit writes inside same transaction for critical changes; trigger blocks UPDATE/DELETE; no audit endpoints to mutate; redaction allowlist | State change without corresponding audit row |
| R-17 | "Every nav item works" target missed | M | M | Medium | 2–6 | Route inventory table per module; nav-crawl E2E enumerating sidebar links; no placeholder components | Merged page with "coming soon" |
| R-18 | Scope/plan too large for phase cadence | H | H | High | All | Vertical slices, hard gates, no speculative features, mock adapters, defer realtime/advanced analytics | Phase gate skipped or tests weakened |
| R-19 | Demo data mistaken for production data | L | H | High | 1, 7 | DEMO labels in seed names/codes and UI banner; synthetic-only fixtures; startup guard if `SEED_DEMO=false` in prod | Real-looking names or locations in seeds |
| R-20 | Mock auth enabled in production | L | C | Critical | 1, 7 | Env validation refuses `AUTH_MODE=mock` when `NODE_ENV=production`; deployment checklist; health endpoint reports auth mode | Prod health shows `mock` |
| R-21 | In-process job crash mid-sync | M | M | Medium | 5 | Idempotent upserts, run status recovery, cursor-based fetch, retry endpoint | Stuck `RUNNING` sync run |
| R-22 | Accessibility/responsive regressions | M | M | Medium | 7 | Radix primitives, focus management, labeled controls, viewport tests 360/768/1280, keyboard E2E | Horizontal overflow on mobile; color-only status |
| R-23 | Express 5 / Prisma / Node 24 compatibility issue | L | M | Medium | 1 | Pin exact versions at scaffold; smoke tests before building features; document upgrade policy | Peer-dependency warnings; runtime deprecations |
| R-24 | Documentation root confusion (nested duplicate pack) | H | L | Low | 1 | Consolidate to single `/docs`; README points to it; delete duplicated copy only after confirmation (no destructive action without approval) | Two divergent specs edited |
| R-25 | Gender/rooming policy without employee attribute or approval | M | H | High | 2 | Do not add sensitive field or enforce policy now; `UNSPECIFIED` default; configurable policy only after stakeholder decision and privacy review | Rooming rule silently enforced |

---

## 3. Security threat quick review

| Threat | Control |
|---|---|
| Session hijacking / CSRF | HttpOnly, Secure (prod), SameSite=Lax cookies; custom header check on mutations; short session TTL with sliding refresh; logout revokes; no token in localStorage |
| Forged role claims | Roles/scopes loaded from DB assignments; OIDC claims only map identity; never trust client role/employee ID |
| IDOR on reservation/room/task/ticket/export | Object-level guards + scope predicates; negative tests per entity; UUIDs not sequential but not treated as authorization |
| QR enumeration/replay | High-entropy tokens, hashed storage, TTL, single-use, rate limit, minimal response payload |
| Privilege escalation via approval | Separation-of-duties check (requester ≠ approver); explicit permission; audit |
| Injection | Prisma parameterization; raw SQL only with bindings; sort/filter allowlists; React escaping; no `dangerouslySetInnerHTML` |
| Export exfiltration | Scope enforcement, row caps, audit export actions, formula-injection sanitization |
| File upload | MIME sniffing, size/type limits, private storage, signed short-lived URLs, entity authorization |
| Log leakage | Pino redaction for authorization headers, cookies, tokens, email/phone where not needed; correlation IDs only |
| Rate-limit bypass in multi-instance deploy | Baseline in-memory limits for single instance; document Redis/shared store requirement before scaling out |

---

## 4. External dependencies and decision gates

| Dependency | Blocks | Current handling | Needed from stakeholder |
|---|---|---|---|
| ZITADEL OIDC configuration | Production login | Adapter + dev mock; prod refuses mock | Issuer, client ID/secret (out-of-band), scopes, redirect URIs |
| Official dormitory inventory | Real content | Synthetic DEMO seed | Locations, buildings, rooms, beds, station mapping |
| Employee API contract | Live employee mirror | Mock provider + local mirror | Endpoint, auth, fields, matching key |
| Roster API contract | Live roster sync | Mock provider; sync disabled | Endpoint, finalized semantics, payload fields |
| Eligibility/rooming/stay policies | Production automation and allocation rules | Configurable defaults, recommendation-only | Written policy + approver |
| Check-in window / identity verification | Front desk behavior | Configurable safe defaults | Operational policy |
| Housekeeping verification policy | Readiness gating | Configurable complete-vs-verify | Who verifies and when |
| Email/Telegram providers | External notifications | In-app only; adapters disabled | Provider, credentials, recipients |
| Data retention/privacy | Production launch | Minimize data; no deletion automation | Retention rules and legal basis |

Any of these being unavailable never blocks manual booking; it blocks only the corresponding automation, which stays behind a flag.

---

## 5. Assumptions that could invalidate the plan

1. Docker remains available on development and CI machines (PostgreSQL/MinIO).
2. A single-tenant deployment is acceptable for v1 (role scopes, not tenant isolation).
3. Beds remain the assignable unit; no capacity-only rooms are introduced.
4. Reservations remain single-dormitory in v1.
5. No public/marketplace or payment requirements are added.
6. Indonesian copy only at launch; no immediate multi-language mandate.
7. Staff QR scanning uses keyboard-wedge scanners or paste; camera capture is optional enhancement.
8. Production infrastructure (TLS termination, secrets, backups) will be supplied or approved separately.
9. Stakeholders will confirm policies before enabling automation; defaults are safe and reversible.
10. Real employee/roster data will not be used in development or seeds.

---

## 6. Risk review cadence

- Review this register at every phase gate; update likelihood/impact with evidence.
- A Critical risk requires an automated test or documented control before the gate closes.
- A High risk requires either a control or an explicit accepted-risk entry in `docs/DECISIONS.md`.
- New externally supplied contracts (OIDC/employee/roster) trigger adapter review and removal of mock defaults only after validation.

---

## 7. Review after Roadmap Phases 2–7 (2026-11-21)

| Risk | Control implemented | Evidence | Residual |
|---|---|---|---|
| R-01 double allocation | `bed_allocations_no_overlap`, transactional recheck, `23P01` → 409 | `db-constraints.test.ts`, concurrency test (one `201`, one `409`, single `HELD`) | Closed for tested paths |
| R-02 scope/IDOR | Shared scope predicates + object guards; explicit SELF denial on reports | Integration cross-crew 403; reports SELF 403; E2E API denials | Closed for implemented modules; new routes need the same review |
| R-03 QR replay | Random 32-byte token, SHA-256 storage, one active token, single-use transaction, rate limit | QR lifecycle + reuse 409 + unique index | Expiry path implemented but not time-warp tested |
| R-04/R-08 readiness and date boundaries | Configurable window (D-008 pending), `[check_in, check_out)` semantics, Jakarta date helpers | Availability lifecycle and adjacent-stay tests | Production default still needs stakeholder approval |
| R-06 roster mutation | Idempotent upsert by source identity; sync never touches reservations | Rerun idempotency test; assignments only | Recommendation/conversion not implemented (no mutation risk yet) |
| R-10 performance | Indexed overlap queries | Not benchmarked | OPEN — load test required |
| R-13 notification failure | Notifications created outside booking transaction; mock delivery log | Lifecycle tests unaffected by notification writes | Real-provider failure injection not executed |
| R-14 export leakage | Reports deny SELF; CSV built from scoped queries | Integration/E2E 403; export content test | XLSX/PDF not implemented |
| R-15 uploads | No upload surface exists | n/a | OPEN if attachments are requested |
| R-16 audit | Append-only trigger; mutations audited | DB test (`42501`), integration audit reads | Coverage of every mutation not exhaustively enumerated |
| R-17 nav completeness | All sidebar items are real pages | E2E crawl of 10 management sections + crew pages | Schedule/calendar absent by scope decision D-038 |
| R-20 mock auth in production | Env guards + unit tests | Unit suite | Unchanged |
| R-22 responsive regressions | Header collapse, bottom nav, overflow E2E | 360/768/1024/1440 checks | Keyboard/focus/contrast audit still pending |
