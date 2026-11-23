# API Specification — Whoosh Stay

**Base path:** `/api/v1`  
**Format:** JSON REST  
**Auth:** OIDC-backed application session or validated bearer token according to deployment design.

## 1. API conventions

Headers:
- `Authorization: Bearer <token>` when bearer strategy is used.
- `Content-Type: application/json`
- `Idempotency-Key: <unique-value>` for retryable create operations.
- `X-Request-ID` optional client correlation identifier.

Success envelope:
```json
{
  "success": true,
  "data": {},
  "meta": { "requestId": "uuid" }
}
```

Error envelope:
```json
{
  "success": false,
  "error": {
    "code": "ROOM_UNAVAILABLE",
    "message": "No eligible bed is available for the requested dates.",
    "details": []
  },
  "meta": { "requestId": "uuid" }
}
```

Use pagination `page`, `pageSize` (default 15, max 100), sorting allowlist and filters. Return `items` and `pagination` metadata. Never interpolate arbitrary sort fields into SQL.

## 2. Authentication and profile

| Method | Path | Purpose |
|---|---|---|
| GET | `/auth/me` | Current user, roles, scopes |
| POST | `/auth/logout` | End local session |
| GET | `/auth/permissions` | Effective permission list |
| GET | `/profile` | Own profile |
| PATCH | `/profile/preferences` | Own permitted preferences |

## 3. Dashboard

| Method | Path | Permission |
|---|---|---|
| GET | `/dashboard/overview` | `dashboard.read` |
| GET | `/dashboard/occupancy` | `reports.occupancy.read` |
| GET | `/dashboard/arrivals-departures` | `stays.read` |
| GET | `/dashboard/alerts` | `dashboard.read` |

Query filters: `from`, `to`, `dormitoryId`, `buildingId`.

## 4. Dormitory and inventory

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/dormitories` | List/create |
| GET/PATCH | `/dormitories/:id` | Detail/update |
| POST | `/dormitories/:id/deactivate` | Deactivate safely |
| GET/POST | `/buildings` | List/create |
| GET/PATCH | `/buildings/:id` | Detail/update |
| GET/POST | `/floors` | List/create |
| GET/PATCH | `/floors/:id` | Detail/update |
| GET/POST | `/rooms` | List/create |
| GET/PATCH | `/rooms/:id` | Detail/update |
| POST | `/rooms/:id/status` | Change operational/readiness status |
| GET/POST | `/rooms/:id/beds` | List/create beds |
| PATCH | `/beds/:id` | Update bed |
| GET/POST | `/facilities` | List/create facility |
| PUT | `/rooms/:id/facilities` | Replace room facility mapping |

## 5. Availability

`GET /availability`

Query:
- `checkIn` (YYYY-MM-DD)
- `checkOut` (YYYY-MM-DD)
- `dormitoryId` optional
- `stationCode` optional
- `occupants` positive integer
- `roomTypeId` optional
- `facilityIds` optional

Response example:
```json
{
  "success": true,
  "data": [{
    "dormitory": { "id": "uuid", "name": "Demo Dormitory" },
    "room": { "id": "uuid", "roomNumber": "101", "type": "Standard" },
    "availableBedCount": 2,
    "capacity": 4,
    "facilities": ["Wi-Fi", "AC"]
  }]
}
```
Search response is advisory. Reservation endpoint must revalidate.

## 6. Reservations

| Method | Path | Purpose |
|---|---|---|
| POST | `/reservations` | Create manual/admin reservation |
| GET | `/reservations` | Scoped list |
| GET | `/reservations/:id` | Scoped detail |
| POST | `/reservations/:id/submit` | Submit draft |
| POST | `/reservations/:id/approve` | Approve |
| POST | `/reservations/:id/reject` | Reject |
| POST | `/reservations/:id/cancel` | Cancel with reason |
| POST | `/reservations/:id/no-show` | Record no-show |
| GET | `/reservations/:id/events` | Reservation history |
| GET | `/my/reservations` | Own reservations |

Create request:
```json
{
  "dormitoryId": "uuid",
  "checkInDate": "2026-12-01",
  "checkOutDate": "2026-12-02",
  "occupants": [
    { "employeeId": "uuid" }
  ],
  "purpose": "Duty accommodation",
  "source": "MANUAL"
}
```

The API must derive the requesting employee from authenticated identity where possible. Do not trust a client-supplied employee ID to book on behalf of another person unless caller has a specific permission.

## 7. Allocation

| Method | Path | Purpose |
|---|---|---|
| POST | `/allocations/preview` | Dry-run allocation |
| POST | `/allocations/execute` | Commit allocation |
| GET | `/allocations` | Scoped list |
| POST | `/allocations/:id/reassign` | Reassign with reason |
| POST | `/allocations/:id/release` | Release allocation |
| GET | `/allocations/conflicts` | View conflict queue |

## 8. Check-in / check-out

| Method | Path | Purpose |
|---|---|---|
| POST | `/check-in/qr/validate` | Validate scanned QR |
| POST | `/check-in/confirm` | Commit check-in |
| POST | `/check-in/manual` | Authorized manual check-in |
| GET | `/stays/active` | Active occupants |
| POST | `/check-out/confirm` | Commit check-out |
| GET | `/check-in/today` | Arrival queue |
| GET | `/check-out/today` | Departure queue |

QR validation must not return raw token or excessive personal data. Confirmation must be idempotent or reject duplicates.

## 9. Housekeeping and maintenance

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/housekeeping/tasks` | List/create tasks |
| GET/PATCH | `/housekeeping/tasks/:id` | Detail/update |
| POST | `/housekeeping/tasks/:id/complete` | Complete |
| POST | `/housekeeping/tasks/:id/verify` | Verify readiness |
| GET/POST | `/maintenance/tickets` | List/create |
| GET/PATCH | `/maintenance/tickets/:id` | Detail/update |
| POST | `/maintenance/tickets/:id/block-inventory` | Block affected inventory |
| POST | `/maintenance/tickets/:id/resolve` | Resolve |
| POST | `/maintenance/tickets/:id/close` | Close after verification |

## 10. Roster and employee integrations

| Method | Path | Purpose |
|---|---|---|
| POST | `/integrations/roster/sync-runs` | Start authorized sync |
| GET | `/integrations/roster/sync-runs` | List runs |
| GET | `/integrations/roster/sync-runs/:id` | Run detail |
| POST | `/integrations/roster/sync-runs/:id/retry` | Retry failures |
| POST | `/integrations/roster/preview` | Dry-run recommendations |
| GET | `/integrations/roster/recommendations` | List recommendations |
| POST | `/integrations/roster/recommendations/:id/convert` | Convert according to policy |
| GET | `/integrations/exceptions` | Exception queue |
| POST | `/integrations/exceptions/:id/resolve` | Resolve exception |
| POST | `/integrations/employees/sync-runs` | Authorized employee sync |

These are Whoosh Stay internal API routes. They do not imply that KCIC external API endpoints exist.

## 11. Reports and exports

| Method | Path | Purpose |
|---|---|---|
| GET | `/reports/occupancy` | Occupancy report |
| GET | `/reports/reservations` | Reservation report |
| GET | `/reports/usage` | Dormitory usage |
| GET | `/reports/stays` | Arrival/departure report |
| GET | `/reports/housekeeping` | Housekeeping report |
| GET | `/reports/maintenance` | Maintenance report |
| GET | `/reports/occupancy.xlsx` | XLSX export |
| GET | `/reports/reservations.xlsx` | XLSX export |
| GET | `/reports/occupancy.pdf` | PDF export |

## 12. Administration

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/admin/roles` | Role management |
| GET/PATCH | `/admin/roles/:id` | Role detail/update |
| GET | `/admin/permissions` | Permission catalog |
| PUT | `/admin/roles/:id/permissions` | Set role permissions |
| GET/POST | `/admin/policies` | Accommodation policies |
| GET/PATCH | `/admin/policies/:id` | Policy detail/update |
| GET | `/admin/audit-logs` | Scoped audit search |
| GET/POST | `/admin/notification-templates` | Template management |

## 13. Standard error codes

- `AUTH_REQUIRED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION_ERROR`
- `EMPLOYEE_NOT_ELIGIBLE`
- `ROOM_UNAVAILABLE`
- `BED_ALLOCATION_CONFLICT`
- `RESERVATION_STATE_INVALID`
- `APPROVAL_REQUIRED`
- `QR_INVALID`
- `QR_EXPIRED`
- `QR_ALREADY_USED`
- `ROSTER_NOT_FINALIZED`
- `INTEGRATION_UNAVAILABLE`
- `IDEMPOTENCY_CONFLICT`

## 14. OpenAPI
Qoder MUST generate and maintain OpenAPI 3.x documentation from the implemented API. Contract tests SHOULD ensure implementation matches the published specification.
