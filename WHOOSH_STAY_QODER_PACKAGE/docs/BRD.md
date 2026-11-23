# Business Requirements Document (BRD) — Whoosh Stay

**Version:** 1.0 | **Product owner:** To be assigned | **Classification:** Internal project specification

## 1. Business overview

Whoosh Stay is an internal web platform for managing KCIC-operated crew accommodation and dormitories. It serves eligible employees, particularly train drivers (Masinis) and Train Attendants, who require accommodation in connection with operational duties.

The product combines:
- A crew-facing hospitality experience for discovering and requesting accommodation.
- An enterprise management experience for dormitory inventory, reservations, room allocation, arrivals/departures, housekeeping, maintenance, reporting and administration.
- Hybrid reservation initiation: manual employee booking and roster-triggered recommendation/booking workflows.

Whoosh Stay is a separate product from Whoosh Health Care and any future fleet/driver-tracking product. It may integrate with approved employee and roster sources through API adapters, but it must retain its own application, database, deployment lifecycle and authorization model.

## 2. Business problem

Current-state problems to validate with stakeholders:
1. Accommodation requests may rely on manual communication or fragmented records.
2. Employees may not have a reliable view of room/bed availability.
3. Dormitory managers may lack a unified operational view across locations.
4. Manual allocation can create avoidable conflicts, under-utilization or administrative effort.
5. Check-in/check-out and actual occupancy may be difficult to reconcile.
6. Housekeeping and maintenance status may not be visible when assigning rooms.
7. Duty roster information may be disconnected from accommodation planning.
8. Historical usage and occupancy reporting may require manual consolidation.

These are problem hypotheses for discovery, not assertions that every KCIC location currently experiences each issue.

## 3. Business objectives

- Centralize internal dormitory and room inventory.
- Provide accurate date-range availability at bed level.
- Enable controlled manual reservations.
- Support roster-informed accommodation recommendations and configurable automation.
- Prevent double allocation and over-capacity booking.
- Track actual occupancy through check-in and check-out.
- Ensure rooms are not offered when blocked, unsafe or under maintenance.
- Improve housekeeping and maintenance accountability.
- Provide reliable operational reporting and audit history.
- Keep the application usable when external employee/roster integrations are unavailable.

## 4. Success measures

Targets are provisional and must be baselined during pilot:

| Measure | Proposed success indicator |
|---|---|
| Reservation conflict | No confirmed overlapping allocation for the same bed |
| Availability accuracy | Availability matches allocation ledger and room blocks |
| Booking traceability | 100% of booking state changes have actor/time/reason |
| Check-in traceability | Check-in records linked to valid reservations |
| Room readiness | Only clean/ready and operational beds are offered |
| Roster processing | Repeated sync does not create duplicate reservations |
| Operational visibility | Managers can view occupancy by date/location |
| Reliability | Core manual booking remains usable during integration outage |
| User experience | Crew can complete a standard booking with clear feedback |

## 5. Stakeholders

- Business sponsor: KCIC representative (to be assigned).
- Accommodation/dormitory operations owner.
- Dormitory managers and administrators.
- Front desk / reception staff.
- Housekeeping team.
- Maintenance team.
- Crew / eligible employees.
- IT / infrastructure / security team.
- HR or employee master-data owner.
- Roster or operations-system owner.
- Internal audit / compliance representative.

## 6. Scope

### In scope
- Crew portal and management portal.
- Employee identity/profile mirror.
- Dormitory, building, floor, room, bed and facility master data.
- Reservation search, request, approval, cancellation and history.
- Reservation sources: manual, roster-assisted, admin-created.
- Allocation and reassignment with conflict prevention.
- Check-in, check-out, QR validation.
- Occupancy calendar.
- Housekeeping tasks and readiness.
- Maintenance tickets and room/bed blocking.
- Roster/employee integration adapters.
- Notification templates and delivery logs.
- Reports, exports, RBAC, audit log and administration.
- Responsive web experience.

### Out of scope for this product
- Public marketplace or public hotel listing.
- External hotel/OTA inventory and payment processing.
- Driver dispatch, vehicle booking or GPS tracking.
- Payroll, attendance, HR core or roster authoring.
- Medical/health records.
- Financial settlement unless later approved as a separate requirement.

## 7. Business rules and operating principles

1. Accommodation is internal-only in the initial product.
2. Reservation supports both manual and roster-based paths.
3. Roster data is an input/reference; Whoosh Stay does not author or modify the source roster.
4. A roster event must not silently overwrite a confirmed reservation.
5. Automatic booking behavior must be controlled by policy, feature flag and approval configuration.
6. The default safe behavior for roster-generated demand is recommendation or pending reservation until the authorized policy is confirmed.
7. Room capacity is represented by individual beds or equivalent assignable units.
8. A bed cannot have overlapping active allocations.
9. A room/bed under a blocking maintenance state or not ready for occupancy cannot be allocated.
10. All exceptions, overrides, approvals and state transitions are auditable.
11. Manual reservation remains available if integrations are offline.
12. Personal data is limited to what is required for accommodation operations.

## 8. Key business outcomes

- One source of truth for dormitory inventory and occupancy.
- Less manual coordination.
- Better capacity planning.
- Clear accountability for reservations and room readiness.
- Traceable employee accommodation history.
- A foundation for future integration and optimization.

## 9. Assumptions and constraints

- KCIC will provide authorized dormitory inventory and policies.
- Employee and roster APIs may not be available during initial development.
- Qoder must build integration interfaces and mocks rather than fabricate live endpoints.
- Production SSO requires approved ZITADEL issuer/client configuration and redirect URIs.
- Data retention, privacy, access scope and audit requirements need stakeholder approval.
- Actual rooming, eligibility and duty-to-stay rules are configurable until confirmed.

## 10. Business risks

| Risk | Mitigation |
|---|---|
| Unconfirmed accommodation policy | Configurable policy engine; block production automation pending approval |
| Inaccurate inventory | Import validation, inventory verification and audit history |
| Roster API changes/outage | Adapter boundary, retries, sync logs, manual workflow |
| Concurrent booking conflict | Database constraints/transactions and concurrency tests |
| Unauthorized employee data access | Backend RBAC, data scope, audit |
| Room readiness mismatch | Housekeeping status and maintenance blocking |
| Automatic booking surprises | Dry-run, preview, approval gates, feature flags |
