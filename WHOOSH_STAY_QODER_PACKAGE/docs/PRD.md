# Product Requirements Document (PRD) — Whoosh Stay

**Version:** 1.0

## 1. Product vision

Deliver an internal accommodation platform that feels as easy to use as a hospitality booking product for crew while giving operations teams the control, traceability and reporting expected from an enterprise property-management system.

## 2. Product surfaces

### 2.1 Crew Portal
A hospitality-first responsive portal:
- Personalized home and upcoming stay summary.
- Search dormitory by date, station/location and eligible capacity.
- View property, room, facilities, rules and availability.
- Create manual reservation request.
- View booking status and booking detail.
- View QR check-in credential when eligible.
- View stay history and cancellation rules.
- View roster-informed accommodation suggestions where enabled.
- Manage own profile preferences and notification settings.

### 2.2 Management Portal
An enterprise-first responsive portal:
- Operational dashboard.
- Reservation queue and approvals.
- Dormitory/building/floor/room/bed management.
- Allocation and reassignment.
- Arrival/departure operations.
- Occupancy calendar.
- Housekeeping and maintenance.
- Roster sync and exception handling.
- Reports, master data, RBAC and audit.

## 3. Personas

| Persona | Needs |
|---|---|
| Crew | Find eligible accommodation, reserve, see status and check in |
| Dormitory Admin | Manage inventory, reservations, approvals and allocations |
| Front Desk | Verify reservation and employee, check in/out |
| Housekeeping | Receive room tasks, update cleaning state |
| Maintenance Officer | Track defects, block unsafe rooms/beds, resolve tickets |
| Dormitory Manager | Monitor all operations and approve exceptions |
| System Administrator | Manage users, roles, integrations and configuration |
| Auditor/Viewer | Read authorized records and audit evidence |

## 4. Information architecture

Management sidebar (8 primary modules plus profile):
1. Dashboard
2. Reservasi Penginapan
3. Manajemen Dormitory
4. Operasional Penginapan
5. Housekeeping & Maintenance
6. Integrasi Jadwal Dinas
7. Laporan & Analitik
8. Pengaturan & Master Data
9. Profil Saya

Crew Portal uses a simplified hospitality navigation and must not expose management modules.

### Submenus

**Dashboard**
- Overview, occupancy KPI, arrivals/departures, pending approvals, room readiness, exceptions.

**Reservasi Penginapan**
- Cari & Booking Penginapan
- Daftar Reservasi
- Reservasi Saya (crew scope)
- Approval Reservasi
- Reservasi Otomatis / Roster
- Riwayat Reservasi
- Pembatalan / No-show

**Manajemen Dormitory**
- Data Dormitory
- Gedung & Lantai
- Data Kamar
- Data Tempat Tidur
- Fasilitas Penginapan
- Ketersediaan Kamar

**Operasional Penginapan**
- Check-in
- Check-out
- Penghuni Aktif
- Alokasi Kamar
- Pindah Kamar
- Kalender Okupansi

**Housekeeping & Maintenance**
- Tugas Kebersihan
- Status Kebersihan Kamar
- Laporan Kerusakan
- Pemeliharaan Kamar
- Riwayat Perawatan

**Integrasi Jadwal Dinas**
- Sinkronisasi Roster
- Jadwal Dinas Kru
- Rekomendasi Penginapan
- Hasil Generate Reservasi
- Konflik & Exception
- Log Sinkronisasi

**Laporan & Analitik**
- Laporan Okupansi
- Laporan Reservasi
- Penggunaan Dormitory
- Check-in / Check-out
- Housekeeping
- Maintenance
- Export Excel/PDF

**Pengaturan & Master Data**
- Master Karyawan (read-only mirror where sourced externally)
- Master Jabatan & Departemen
- Tipe Kamar
- Master Fasilitas
- Aturan Reservasi
- Kebijakan Menginap
- Pengguna & Hak Akses
- Master Notifikasi
- Audit Log

## 5. Core user journeys

### Journey A — Crew manual booking
1. Crew signs in.
2. Crew enters check-in/check-out dates and location/station.
3. System checks eligibility and live bed availability.
4. Crew views matching dormitory/room options.
5. Crew selects an option and submits.
6. System validates policy and creates pending/confirmed request based on configuration.
7. If approval is required, authorized admin reviews.
8. Crew receives status notification.
9. Confirmed reservation detail shows assigned accommodation and check-in instructions.

### Journey B — Roster-assisted accommodation
1. Authorized integration syncs finalized roster data.
2. System identifies eligible duty assignments.
3. Policy engine calculates accommodation need using configured lead/lag rules.
4. Existing reservations are matched to avoid duplicates.
5. System generates recommendations or pending requests.
6. Allocation preview checks capacity and conflicts.
7. Authorized workflow confirms or approves.
8. Crew receives notification.
9. Roster changes create exceptions/re-evaluation, not silent mutation.

### Journey C — Front desk check-in
1. Staff opens arrival queue or scans QR.
2. Backend validates signed/opaque token, reservation status, time window and assigned employee.
3. Staff verifies identity according to policy.
4. Check-in is committed once.
5. Occupancy state and audit log update.
6. Duplicate scan returns a safe conflict response.

### Journey D — Check-out and room readiness
1. Staff records check-out.
2. System closes active stay.
3. Room/bed becomes dirty/needs inspection, not immediately available.
4. Housekeeping task is created.
5. Housekeeping completes checklist and submits.
6. Authorized verification sets room/bed ready.
7. Availability is recalculated.

### Journey E — Maintenance
1. Defect is reported against room/bed/facility.
2. Priority and scope are recorded.
3. If safety/operability requires, affected inventory is blocked.
4. Work is assigned and tracked.
5. Resolution is verified.
6. Inventory returns to service only after authorized readiness action.

## 6. Product requirements by module

### 6.1 Dashboard
- Filter by date range, dormitory and building.
- Show total capacity, occupied beds, available beds, blocked beds and occupancy rate.
- Show arrivals/departures today, pending approval and exceptions.
- KPI definitions must be documented and consistent.
- Avoid counting pending reservations as actual occupancy.

### 6.2 Search and availability
- Search by stay date range, location/station and occupant count.
- Show only eligible, operational and ready inventory.
- Availability must be calculated for every night/date interval in the stay.
- Show room attributes, facilities, policy notes and available bed count.
- Revalidate availability at submit time; search results are not a guarantee.

### 6.3 Reservation
- Support manual, roster-generated and admin-created sources.
- Store source reference and idempotency key for roster-created requests.
- Support configured approval policy.
- Support cancellation with reason and policy checks.
- Preserve history; do not hard-delete business transactions.
- Reservation states and allowed transitions are defined in SRS.

### 6.4 Allocation
- Assign one or more beds according to occupant count.
- Validate overlap, room capacity, room policy, employee eligibility and readiness.
- Support preview/dry-run and execute.
- Manual override requires permission and reason.
- Reassignment must preserve old allocation history.

### 6.5 Check-in/out
- QR is a convenience token, not a replacement for identity/policy verification.
- Tokens are random, time-limited, one-time-use and stored hashed.
- Staff may use controlled manual lookup if QR fails.
- Check-in/out must be idempotent or reject duplicates safely.

### 6.6 Housekeeping
- Create task after check-out or authorized request.
- Assign task and record status, checklist, notes and evidence.
- Bed/room remains unavailable until required readiness checks pass.

### 6.7 Maintenance
- Track issue category, priority, room/bed, attachments, assignee and status.
- Allow blocking affected room/bed.
- Closing a ticket does not automatically mark the room ready unless policy permits.

### 6.8 Roster integration
- Adapter-based integration with external roster source.
- Only finalized/approved source roster records qualify.
- Sync must be idempotent and logged.
- Provide dry-run, preview, exceptions, retry and reconciliation.
- Do not invent endpoint URLs or payload fields; define adapter contract and mock data until supplied.

### 6.9 Reporting
- Filter by period, dormitory, building, room, employee, source and status.
- Export only authorized rows.
- Report definitions must distinguish capacity, availability, occupancy, reservation and blocked inventory.

## 7. Product acceptance criteria

- Crew can complete manual booking end-to-end.
- Admin can configure dormitory hierarchy and bed inventory.
- Availability is accurate for date intervals.
- Concurrent booking attempts cannot allocate the same bed twice.
- Approval and cancellation rules are enforced server-side.
- Check-in/out creates correct occupancy history.
- Housekeeping/maintenance blocks inventory appropriately.
- Roster sync is idempotent and exceptions are visible.
- Crew cannot access other employees' reservation data.
- Management data scope is enforced by backend.
- Core workflow works with external integrations disabled.
- All primary navigation items resolve to real implemented pages; no dead links or fake actions.
