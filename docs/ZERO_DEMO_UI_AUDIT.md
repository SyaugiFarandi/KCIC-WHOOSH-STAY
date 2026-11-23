# Zero Demo UI Audit — WHOOSH STAY

**Date:** 2026-11-22 · **Policy:** REAL OPERATIONAL DATA FINALIZATION & ZERO DEMO UI brief (Phase 6 sweep, re-verified after the synthetic-employee and accommodation-research batches) · **Decision record:** D-050

**Goal:** in password/SSO sessions the UI must never present demo/dummy/sample data as operational reality. Demo displays are permitted **only** in the isolated mock fixture environment, where they are honest labels — not disguises. Per the standing rule: "Jangan sekadar menghilangkan label DEMO" — labels were not stripped to hide origin; data itself was purged/isolated and every remaining display is gated.

---

## 1. Method

1. **Static sweep** of `apps/web/src` (`*.ts`, `*.tsx`) for `demo|dummy|sample|fake|data palsu` (case-insensitive; input `placeholder=` attributes excluded as unrelated). Re-run on the current code: **57 matches**, each classified below.
2. **Gating verification** — every demo display traced to `useIsDemoEnv()` / `me?.session.authMode === 'mock'` (`apps/web/src/auth/AuthProvider.tsx:142`). Dev runs `AUTH_MODE=password`; the mock mode exists only for the isolated test/e2e fixture databases.
3. **Runtime verification** — live management sweep in a real browser (password session): true zeros, no demo text, professional empty states; E2E suite **89/89 passed** on the isolated fixture (2026-11-22), including RBAC navigation, responsive audit and dashboard assertions.
4. **Server-side enforcement** — `dev-login` is mounted only when `AUTH_MODE=mock` outside production (404 otherwise); production refuses mock authentication (`env.test.ts` 9/9, `auth-password.test.ts` 8/8). Frontend gating is UX, **never** the security mechanism.

## 2. Classification of all 57 static matches

| Category | Matches | Files | Verdict |
|---|---|---|---|
| Demo-env labels gated by `authMode === 'mock'` / `useIsDemoEnv()` | ~30 | `ManagementLayout.tsx` (DEMO DATA badge, "Lingkungan DEMO" footer), `CrewLayout.tsx`, `CrewHomePage.tsx`, `CrewSearchPage.tsx`, `CrewReservationsPage.tsx`, `CrewNotificationsPage.tsx` (MOCK delivery disclaimer), `CrewProfilePage.tsx`, `DashboardPage.tsx` (description + auth-mode line) | **Correct** — visible only in the mock fixture env; password/SSO sessions get operational wording ("Angka berasal langsung dari database operasional.", "login email/password · Kredensial dikelola lokal oleh administrator.") |
| Display-normalization helpers (`demoLabel`, `stripDemoPrefix`) | ~15 | `lib/format.ts:68`, `CrewBookingPage.tsx`, `CrewDormitoryPage.tsx`, `CrewSearchPage.tsx` | **Correct** — strip the `DEMO ` prefix from mock-fixture names for readability; a no-op on real data (real names carry no prefix). Not a demo display. |
| Type / endpoint identifiers | 4 | `AuthProvider.tsx` (`DemoLoginInput`, `/auth/demo-login`) | **Correct** — shared contract naming for the mock-only endpoint; server refuses it in password/oidc/production modes |
| Honest source badges (transparency, not concealment) | 1 | `EmployeesPage.tsx:128` (`sourceSystem === 'DEMO' \|\| SYNTHETIC` → warning badge) | **Correct** — makes test-data origin *more* visible, per the synthetic-data brief ("Jangan pernah menyajikannya sebagai data operasional asli") |
| Legitimate non-demo usage | 2 | `RosterPage.tsx` (`preview.sample` = import preview rows) | **Correct** — "sample" here means preview rows of a real import batch, not dummy data |
| `dummy` / `fake` / `data palsu` | **0** | — | Clean |

**No ungated demo text exists in password/SSO sessions.** The two fixes from the original Phase 6 sweep (dashboard description and auth-mode line gated to `authMode`) remain in place and were re-verified in the current code.

## 3. Runtime evidence (password session, purged dev DB)

| Surface | Observed state |
|---|---|
| Dashboard | "0 dari 0 tempat tidur terisi"; all KPIs 0; live API `/dashboard/operations` returns zeros for reservations/occupancy/housekeeping/maintenance/trend (checked 2026-11-22); description reads "Angka berasal langsung dari database operasional." — no DEMO wording |
| Employees | 60 SYNTHETIC profiles with warning badges + permanent notice: test data for display/flow testing, not real KCIC employees, no login accounts, to be replaced via official HR import |
| Inventory / Master Data | "Tidak ada dormitory" empty states; 5 team-verified locations; org references shown as UNCONFIRMED |
| Gallery | Empty state ("Belum ada dormitory"); 0 photos, 0 MinIO objects; no broken image references (gallery is DB-driven) |
| Research | Permanent policy notice: public search results never automatically become KCIC operational facilities; promote button disabled unless VERIFIED_OFFICIAL_KCIC + APPROVED |
| Reservations / reports / roster | True zeros from PostgreSQL; roster sync badge MOCK (honest adapter label) |
| Users & Access | 1 ACTIVE admin + 12 **Disabled** demo accounts — honest historical records (null hashes, no roles, no sessions), not demo functionality |
| Login | No demo selector, no demo account list; email + password only |

## 4. Honest exceptions (records, not disguises)

1. **12 isolated DISABLED demo accounts** remain visible in Users & Access because the append-only audit trigger forbids deleting audit actors. They cannot authenticate and hold no access; final disposal is a stakeholder decision after audit review.
2. **Immutable audit history** retains past demo-era entries — append-only by design; never rewritten.
3. **Login background photo** is generated imagery, disclosed as such in `IMPLEMENTATION_STATUS.md` §2 — not an official KCIC photograph, not operational data.
4. **Mock fixture environment** (`whoosh_stay_test` / `whoosh_stay_e2e`, `AUTH_MODE=mock`) intentionally displays DEMO labels — this is the honest labeling the brief requires, fully separated from the operational dev database.

## 5. Conclusion

The zero-demo policy holds on the current code: operational surfaces show verified records or honest empty states; every demo string is either gated to the mock fixture environment, a no-op normalizer, an identifier, or a transparency badge. Server-side mode enforcement backs the UI gating. Re-verified by static sweep (57/57 classified), live browser checks, and the full 89/89 E2E regression.