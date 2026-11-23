# UI/UX Redesign — Route Inventory & Checklist

Living document for the full-application UI/UX redesign (crew + management).
Scope: presentation, layout, hierarchy, states, and responsiveness only. Business logic,
API contracts, database schema, reservation lifecycle, and RBAC are unchanged.

Status per page: `NOT STARTED` | `IN PROGRESS` | `REDESIGNED` | `VERIFIED`.
A page is `VERIFIED` only after visual review (desktop + mobile), interaction/API checks,
RBAC check for guarded routes, and the regression suite still pass.

Last verification: 2026-11-22 (full E2E 91/91 after the collapsible-sidebar + design QC batches and the D-053 profile/Telegram card).

## Design system baseline

- Logo, typography, icon family (lucide), and spacing scale are shared via
  `apps/web/src/components/ui.tsx` and `Logo.tsx`.
- Management sidebar background stays exactly `#8B1A1A` (verified by E2E).
- Status semantics stay in `StatusBadge` (success/warning/danger/info/neutral); enum values are
  humanised in the UI (`READY` → `Ready`, `AUTH_LOGIN` → `Auth login`) instead of raw codes.
- Surfaces: `#f3f1ed` management shell, `sand-50` crew shell, white cards,
  `brand-700` primary actions, `gold-400` accents.
- Every list page: header + filters + result count + table/cards + pagination/empty/error.
  Dense management lists use stacked rows (not wide tables) so actions stay visible at 1280.
- Every detail page: identity summary, status timeline, primary actions, secondary metadata.
- Modals: focus trap, escape/backdrop close, focus restore.
- Responsive widths audited: 360, 390, 768, 1024, 1280, 1440, 1920; sidebar navigation also checked
  at 720–3840 CSS px, which is the layout equivalent of 1440 px at browser zoom 200%/175%/150%/125%/
  100%/90%/75%/50%.
- No decorative buttons and no fake data: every control calls the existing API.

## Route inventory

Public / shell

| # | Route | Component | Status |
|---|-------|-----------|--------|
| 1 | `/login` | `LoginPage` | VERIFIED |
| 2 | `/forbidden` | `ForbiddenPage` | VERIFIED |
| 3 | `*` (404) | `NotFoundPage` | VERIFIED |
| 4 | `/` | `PortalLanding` (redirect guard) | VERIFIED |

Crew portal (`/crew`)

| # | Route | Component | Status |
|---|-------|-----------|--------|
| 5 | `/crew` | `CrewHomePage` | VERIFIED |
| 6 | `/crew/search` | `CrewSearchPage` | VERIFIED |
| 7 | `/crew/dormitories/:id` | `CrewDormitoryPage` | VERIFIED |
| 8 | `/crew/book` | `CrewBookingPage` | VERIFIED |
| 9 | `/crew/reservations` | `CrewReservationsPage` | VERIFIED |
| 10 | `/crew/reservations/:id` | `CrewReservationDetailPage` | VERIFIED |
| 11 | `/crew/history` | `CrewReservationsPage` (history) | VERIFIED |
| 12 | `/crew/schedule` | `CrewSchedulePage` | VERIFIED |
| 13 | `/crew/check-in` | `CrewCheckInPage` | VERIFIED |
| 14 | `/crew/check-out` | `CrewCheckOutPage` | VERIFIED |
| 15 | `/crew/notifications` | `CrewNotificationsPage` | VERIFIED |
| 16 | `/crew/profile` | `CrewProfilePage` | VERIFIED |
| 17 | `/crew/help` | `CrewHelpPage` | VERIFIED |

Management portal (`/manage`)

| # | Route | Component | Status |
|---|-------|-----------|--------|
| 18 | `/manage/dashboard` | `DashboardPage` | VERIFIED |
| 19 | `/manage/reservations` | `ManagementReservationsPage` | VERIFIED |
| 20 | `/manage/availability` | `ManagementAvailabilityPage` | VERIFIED |
| 21 | `/manage/calendar` | `ManagementCalendarPage` | VERIFIED |
| 22 | `/manage/front-desk` | `FrontDeskPage` | VERIFIED |
| 23 | `/manage/inventory` | `ManagementInventoryPage` | VERIFIED |
| 24 | `/manage/gallery` | `ManagementGalleryPage` | VERIFIED |
| 25 | `/manage/housekeeping` | `HousekeepingPage` | VERIFIED |
| 26 | `/manage/maintenance` | `MaintenancePage` | VERIFIED |
| 27 | `/manage/roster` | `RosterPage` | VERIFIED |
| 28 | `/manage/reports` | `ReportsPage` | VERIFIED |
| 29 | `/manage/notification-deliveries` | `NotificationDeliveriesPage` | VERIFIED |
| 30 | `/manage/employees` | `EmployeesPage` | VERIFIED |
| 31 | `/manage/users` | `UsersPage` | VERIFIED |
| 32 | `/manage/audit` | `AuditLogsPage` | VERIFIED |
| 33 | `/manage/settings` | `SettingsPage` | VERIFIED |
| 34 | `/manage/profile` | `CrewProfilePage` | VERIFIED |
| 35 | `/manage/master-data` | `MasterDataPage` | VERIFIED |

## Page-group changes

- **Shell & login**: fullscreen generated railway photo (`/photos/login-railway-1792.webp`,
  1024 px variant) under a dark gradient; centred 420 px ivory card with the illustrated lockup,
  "Selamat Datang Kembali", username/password (show/hide) and a `#8B1A1A` "Masuk" button. The
  demo-account selector is removed; no demo accounts are listed. `/` is a pure redirect guard; `/forbidden` and
  404 use the same branded card.
- **Sidebar navigation & toggle**: the management sidebar uses `#8B1A1A` with white labels/icons,
  small uppercase group headings (Utama, Reservasi, Operasional, Inventaris, Laporan,
  Pengelolaan Sistem), divider rules and an Akun block (profile + logout) at the bottom. "Laporan"
  is a submenu whose children map to real `ReportsPage` tabs (`?tab=reservations|occupancy|operational`),
  so child active state, deep links and browser history work without new routes. Parents expose a
  rotating chevron and `aria-expanded`/`aria-controls`; children use `aria-current="page"` and an
  ivory active surface with maroon text. Navigation is derived from the signed-in permissions; a
  group disappears when no child is permitted, and direct URLs remain server-guarded. One persistent
  three-dot (`Ellipsis`) control switches the sidebar between 276 px (labels) and a 76 px icon rail
  with a 260 ms width transition; tooltips "Ciutkan sidebar"/"Perbesar sidebar" show on hover and
  keyboard focus, the preference persists, collapsed groups open keyboard-dismissable flyouts with
  the same submenu children, and the mobile drawer keeps its own X. The drawer closes after a
  navigation choice and the submenu reopens automatically under an active child.
- **Crew home/search/detail**: availability cards, single cover photo per dormitory, interior
  gallery + lightbox, room cards with housekeeping status, floor headings de-duplicated.
- **Crew reservations**: stacked list rows; approval badge only for `PENDING_APPROVAL` +
  `PENDING`; "Utama" primary-guest label; detail page keeps cancel/QR actions.
- **Crew booking/check-in/check-out**: three-step progress, sticky summary card, QR modal with
  expiry + one-time-use badge, explicit empty states with links back to reservations.
- **Crew notifications/profile/help**: mobile-friendly mark-read control (icon-only at 360–390),
  humanised event names, permission chips wrap without internal scroll, help cards link to real
  routes.
- **Management dashboard**: status hints no longer expose enums (`PENDING`/`IN_PROGRESS`,
  `CANCELLED + REJECTED`, `MOCK`/`DISABLED` → localised labels); trend/service/quick-link cards
  use `items-start` grids so tall columns do not stretch short cards.
- **Management reservations/front desk**: wide table replaced with stacked rows (booking code,
  status, dormitory, source, guest count, allocation) so Detail/Approve/Reject/Allocate stay
  visible at 1280; approval reasons no longer hidden.
- **Management availability/inventory**: availability bed chips use `StatusBadge`; inventory room
  cards show operational + housekeeping badges, readable gender labels, floor-heading de-dupe.
- **Management housekeeping/maintenance/roster**: labelled categories/priorities/sources,
  attachment evidence inline with checklist chips, `StatCard` summary row on roster.
- **Management reports**: sticky table header, `formatDate` filters and dates, horizontal scroll
  container for the wide report table, localised sources/categories; separate CSV and XLSX export
  buttons with per-format loading state (Phase D).
- **Management calendar** (Phase C): month grid with per-day occupancy bar, arrival/departure
  counts and aria-labelled day buttons; list fallback under `lg`; dormitory filter, prev/next
  and "Bulan ini" actions; selected-day detail with `StatusBadge` and links to reservations.
- **Crew schedule** (Phase C): month navigation, "Jadwal bulan ini / Akan datang / Sedang
  berlangsung" stat cards, stays grouped by check-in date with allocation summary or an amber
  "Belum dialokasikan" hint, each row linking to reservation detail.
- **Management employees/users/audit/settings/deliveries**: truncated emails with tooltips,
  localised role/scope/approval-mode labels, localised audit actions/entities, request IDs
  truncated with title, no raw enums in badges.
- **Management gallery**: see Phase B3 verification (upload, preview, cover, reorder, delete,
  per-room coverage cards).

## Verification log

- Login (brand refresh): fullscreen railway backdrop reviewed in-browser at 1440/1280/390/360;
  card centred, logo and photo load locally, password toggle, validation and invalid-credentials
  messages verified, crew/admin redirection verified, zero horizontal overflow; no external image
  hotlinks and no demo-account selector. Assets and decision recorded in D-041.
- Sidebar toggle: browser-verified expanded (276 px, labels, three-dot tooltip) and collapsed
  (76 px rail, brand symbol, icons, "Perbesar sidebar" tooltip, flyout navigation to
  `/manage/availability`), persisted across reload, mobile drawer X intact, zero horizontal
  overflow at 1440 and 390; `tests/e2e/sidebar.spec.ts` 4/4 passed.
- Sidebar navigation redesign (2026-11-21): group/submenu structure, ivory active child, parent
  toggle with `aria-expanded`, deep links, back/forward between report tabs, collapsed flyout via
  hover and keyboard focus with Escape dismissal, mobile drawer, permission-filtered visibility
  (housekeeping, dormitory manager) and server-guarded direct URLs; all 20 management routes opened
  from the sidebar with an `aria-current` item; zero horizontal overflow at 1920 and at
  zoom-equivalent widths 720–3840; collapsible group accordions with route-driven auto-open
  (`tests/e2e/sidebar-navigation.spec.ts` 8/8 passed). Axe WCAG 2.1
  A/AA remained clean after adding `/manage/master-data` to the scan (4/4).
- Crew search/detail: lightbox E2E (counter + keyboard), unique cover photos, mobile overflow 0.
- Management gallery: upload/reorder/cover/delete E2E; responsive E2E at 4 widths.
- Dashboard: fixed mobile grid min-width overflow (360px), verified by responsive E2E.
- Full functional suite (2026-11-21): `npx playwright test tests/e2e/auth.spec.ts
  tests/e2e/brand.spec.ts tests/e2e/crew.spec.ts tests/e2e/gallery.spec.ts
  tests/e2e/management.spec.ts tests/e2e/rbac.spec.ts tests/e2e/responsive.spec.ts`
  → 27/27 passed. Includes crew booking/cancel flow, QR check-in page, management
  approval/allocation sections, RBAC guards, and exact `#8B1A1A` sidebar assertion.
- Responsive overflow audit (2026-11-21, re-run with Phase C routes): `tests/e2e/responsive-audit.spec.ts` loads all 11 crew
  routes as crew and all 17 management routes as admin at 360/390/768/1024/1280/1440 and asserts
  no unfixed element crosses the viewport edge → 12/12 passed, 0 offenders.
- Calendar (Phase C): `/manage/calendar` and `/crew/schedule` reviewed at 1280 and 390 (grid,
  list fallback, month navigation, day detail); integration invariants 2/2.
- Reports export (Phase D): CSV and XLSX buttons download real files in the browser; compact
  `CSV`/`XLSX` labels with `aria-label` keep the header on one line at 768–1440; reviewed at
  1280 and 390.
- Accessibility (Phase E): `tests/e2e/a11y.spec.ts` runs axe WCAG 2.1 A/AA on `/login`, all 11
  crew routes, all 17 management routes and an open reservation modal → 4/4 passed. Contrast
  fixes darkened `ink-400`/`ink-500`; ambiguous accessible names were replaced (crew logo,
  calendar days, gallery previews, mark-read); login now exposes a `main` landmark; the hidden
  attachment input is labelled; report/settings scroll regions are keyboard focusable. Modal
  focus trap, Escape close and focus restore are asserted with the keyboard.
- Visual review: full-page screenshots at 1280 for every management route and every crew route;
  mobile (390) capture for dashboard, availability, gallery, reservations, inventory, reports,
  users, settings, housekeeping, all crew routes, `/forbidden`, 404, and `/`.
- RBAC: `tests/e2e/rbac.spec.ts` plus `PermissionRoute` guards; pages are only reachable with the
  existing permission codes — no permission checks were weakened for the redesign.
- Business logic untouched: only presentation files under `apps/web/src` changed; API, Prisma,
  seed, and reservation lifecycle were not modified during this phase.
- Final regression (Phases K–M): full `npx playwright test` run → 43/43 passed across
  functional, accessibility, RBAC, brand, responsive and responsive-audit specs after the
  roster provenance label fix; typecheck/lint/build exit 0. No redesign-era UI change was
  reverted, and no RBAC check or layout audit regressed.
- Brand/login/sidebar regression (2026-11-21): full `npx playwright test` → 48/48 passed
  (including sidebar 4/4), typecheck/lint/build exit 0, unit 28/28, integration 51/51.
  Full-run fixes: crew-home timestamp contrast and unread-badge accessible name, dashboard
  grid min-track clamp at 1024, calendar event-list shrink at 360/390, and the crew schedule
  test updated to the "Kalender perjalanan" heading.

## Skill-based UI/UX audit (2026-11-21)

Method: environment skill discovery (only `ui-ux-pro-max` was installed and selected by the
user; other requested skills — frontend-design, design-system, web-design-guidelines,
accessibility, responsive-design, tailwindcss, react-best-practices, data-visualization,
motion-design, playwright — were not installed and were not added from untrusted sources).
Audit executed against its priority rules (accessibility → touch/interaction → performance →
style → layout/responsive → typography/color → animation → forms/feedback → navigation →
charts) plus a full read of every page under `apps/web/src/pages`. Paths below are relative
to `apps/web/src`. Status: FIXED = implemented and verified; OPEN = tracked for the
page-level improvement pass.

### HIGH

| # | Finding | Location | Status |
|---|---------|----------|--------|
| H1 | `text-gold-300` is not a defined token (only gold-400/500 exist) → invisible label on dark photo overlay | `pages/CrewBookingPage.tsx:325` | FIXED → `text-gold-400` |
| H2 | `bg-gold-300` undefined → selected-day marker invisible on brand-700 | `pages/CrewSchedulePage.tsx:222` | FIXED → `bg-gold-400` |
| H3 | `mode="history"` only changes labels; the query never filters terminal statuses, so "Riwayat" shows active reservations | `pages/CrewReservationsPage.tsx:125-137`, route `App.tsx:197` | FIXED (D-045) → history mode sends `statuses=CHECKED_OUT,CANCELLED,REJECTED,NO_SHOW` |
| H4 | Native `window.confirm` for activate/deactivate instead of accessible ConfirmDialog | `pages/ManagementInventoryPage.tsx:294` | FIXED → `ConfirmDialog` with loading state |
| H5 | Check-out lookup (`lookupByCode`) has no pending/disabled state → double submit possible | `pages/FrontDeskPage.tsx:322-329` | FIXED → per-row `loading` + all-row `disabled` while lookup pending, `.catch` error notice |

### MEDIUM

| # | Finding | Location | Status |
|---|---------|----------|--------|
| M1 | Five queries without `isError` handling → failures render as false empty states | `pages/CrewHomePage.tsx:50-80,193-207,405` | FIXED → 4/5 already had error states; exploration query got inline warning + retry, bed counts stay visible |
| M2 | Availability error shows misleading "no rooms" empty message; dormitories query silent on error | `pages/CrewBookingPage.tsx:273-278,50-54` | FIXED → availability `ErrorState` existed; added dormitories error hint + retry, conditional bed-count header, stale-bed clearing effect |
| M3 | Gallery query error → hero Skeleton forever | `pages/CrewSearchPage.tsx:88-92,288` | FIXED (verified) → hero already renders error panel + retry on `gallery.isError`; availability has `ErrorState` with retry |
| M4 | Hand-rolled tab buttons without `role="tab"`/`aria-pressed` | `pages/HousekeepingPage.tsx:138-163` | FIXED → shared `Tabs` (role=tablist/tab, aria-selected, roving tabindex, arrow keys) |
| M5 | START/COMPLETE/VERIFY buttons not disabled while action pending (MaintenancePage does this correctly) | `pages/HousekeepingPage.tsx:267-301` | FIXED → `disabled={action.isPending}` + per-action loading on all buttons |
| M6 | Hand-rolled delete confirmation, raw input/buttons, off-palette `red-100/red-500` | `pages/ManagementGalleryPage.tsx:388-394,467-511,570-613` | FIXED → delete modal already uses shared `Modal` + danger `Button` with loading/disabled and keeps the photo preview (ConfirmDialog has no children slot — kept deliberately); icon button shades aligned to system danger (`red-200`/`red-700`/`red-50`) |
| M7 | Dormitory filter query has no error state | `pages/ManagementInventoryPage.tsx:64-71,245` | FIXED → `ErrorState` with retry in dormitory list |
| M8 | Dashboard renders 0 as real data while overview loading/errored; no skeleton | `pages/DashboardPage.tsx:238-290,352-369` | FIXED → Foundation skeletons while loading, `ErrorState` retry, all signal/trend/service values fall back to '—' instead of 0 |
| M9 | markRead/markAll mutations without `onError` feedback | `pages/CrewNotificationsPage.tsx:39-53` | FIXED → `onError` danger Notice + concurrent mark-read disabled |
| M10 | Raw hex values outside token system (`#141311/#201d19/#2b2621`, `#efe9df`, `#faf8f4`) | `pages/CrewHomePage.tsx:108`, `pages/CrewSearchPage.tsx:210,591`, `pages/CrewReservationDetailPage.tsx:173` | FIXED → all tokenized (`bg-sand-50` etc.); grep confirms zero raw hex left in crew pages (LoginPage brand artwork excluded by design) |
| M11 | Filter queries silent on error | `pages/ManagementCalendarPage.tsx:84-88`, `pages/ManagementAvailabilityPage.tsx:31-35` | FIXED → dormitory filter error hint + "Coba lagi" retry under both Selects |
| M12 | Search toolbar markup duplicated across 8+ pages → extract shared `SearchInput` | ManagementReservations/ManagementInventory/CrewReservations/AuditLogs/Employees/MasterData/Roster/Users | FIXED → shared `SearchInput` (ui.tsx) with exact icon alignment; all 9 instances across 8 pages migrated, per-page `mt-1`/`mt-0.5` hacks removed |
| M13 | Month-navigation toolbar + `monthLabel`/`shiftMonth`/`longDate` duplicated; `min-w-[128px]` label caused 320px horizontal overflow on `/manage/calendar` and `/crew/schedule` | `pages/ManagementCalendarPage.tsx`, `pages/CrewSchedulePage.tsx` | FIXED → shared `MonthNavigator` (ui.tsx) + date helpers in `lib/format.ts`; toolbar wraps and label min-width reduced below `sm` |
| M14 | Layout header + skip-link markup duplicated between crew and management shells → candidate shared `AppHeader` | `layouts/CrewLayout.tsx:86-91,124-168`, `layouts/ManagementLayout.tsx:246-251,289-335` | PARTIAL → identical skip-link extracted to shared `SkipLink` (ui.tsx) used by both shells. Full `AppHeader` unification DEFERRED: crew (mobile top bar + bottom nav) and management (sidebar + header) layouts are intentionally different; merging them risks regressions in the 34 responsive-audit tests for no user-visible gain |

### LOW

| # | Finding | Location | Status |
|---|---------|----------|--------|
| L1 | Calendar table lacks caption/aria-label; raw rose/amber/emerald-500; hand-rolled view toggle | `pages/ManagementCalendarPage.tsx:68-71,186-211,267,323-326` | FIXED → `sr-only` caption with month label, view toggle `role="group"` + aria-label (buttons already `aria-pressed`), rose shades → system danger red (`bg-red-500` bar, `bg-red-50 text-red-700` chip); amber/emerald kept as semantic status hues |
| L2 | Title-only tooltips (values also printed, so accessible); raw `red-400/15`, `red-200`; MiniStat duplicates StatCard | `pages/DashboardPage.tsx:216-225,481,495,508-516` | FIXED → alert chip/value → `bg-brand-400/20 text-brand-200`; values fall back to '—'. MiniStat KEPT as compact in-card variant (StatCard is full-size) — documented design decision, not duplication |
| L3 | Arbitrary shadows; raw `bg-red-500/emerald-500` | `pages/CrewSearchPage.tsx:262,299,562` | FIXED → shadows → `var(--shadow-pop)` / `var(--shadow-soft)`; emerald/red-500 availability bars KEPT as semantic status hues (same convention as Badge tones and calendar bars) |
| L4 | Link-as-button styling hand-rolled (Button has no link variant) | crew pages + `pages/DashboardPage.tsx:126,135` | DEFERRED (documented) → text links already consistent (`text-brand-700 hover:text-brand-800`); Dashboard CTAs are context-styled hero buttons on dark artwork. Button is button-element-based; adding polymorphic link support for two CTAs is premature abstraction with regression risk across all pages |
| L5 | Inert bed chips without `beds.manage`; fixed 300px column | `pages/ManagementInventoryPage.tsx:189,385-404` | FIXED → chips render as static `span` without permission; 300px column is desktop-only (`lg:`), and both grid columns got `min-w-0` to stop the 320px overflow caused by nowrap dormitory names |
| L6 | "undefined/undefined" summary if selected bed disappears from availability | `pages/CrewBookingPage.tsx:366-370` | FIXED → stale selection auto-cleared via effect; summary shows "Tidak tersedia lagi — pilih ulang" fallback |
| L7 | `displayName`/demo-label helper duplicated in 6 crew pages | crew pages | FIXED → shared `displayName` in `lib/format.ts`, imported by 8 crew pages (incl. CrewSearchPage); nullable/humanize `demoLabel` variants kept where semantics differ |
| L8 | Raw `text-emerald-700` | `pages/MaintenancePage.tsx:294` | RESOLVED (consistent) → `text-emerald-700` at :357 matches the system semantic success shade used by Badge `success` tone; not an off-system color |

Notes: LoginPage hex values are intentional brand artwork and out of scope. No clickable
`div`s or placeholder-only inputs were found. Sidebar `#8B1A1A`, RBAC guards, API contracts,
and reservation lifecycle remain untouched by all fixes above.
