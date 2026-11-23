# Testing Strategy — Whoosh Stay

## 1. Quality objectives
- Prevent double allocation.
- Enforce access control and data scope.
- Maintain accurate room/bed readiness and occupancy.
- Make roster synchronization idempotent.
- Ensure all primary navigation and actions work.
- Protect employee data and QR credentials.
- Maintain a repeatable local setup.

## 2. Test layers

### Unit tests
- Date interval overlap.
- Availability calculation.
- Reservation state transitions.
- Eligibility and policy evaluation.
- Allocation candidate ranking.
- QR token expiry/hash validation.
- RBAC scope resolver.
- Report KPI calculations.
- Roster mapper/idempotency.

### Integration tests
- API + PostgreSQL repositories.
- Reservation transaction rollback.
- Exclusion constraint/locking behavior.
- OIDC claim mapping using test issuer or mocks.
- MinIO upload/download signed URL.
- Notification provider failure/retry.
- Roster adapter sync and reconciliation.

### E2E tests (Playwright)
1. Crew login and profile.
2. Crew searches available dormitory.
3. Crew submits manual reservation.
4. Admin approves request.
5. Crew sees confirmed booking.
6. Front desk scans/validates QR.
7. Front desk checks in crew.
8. Crew checks out.
9. Housekeeping task is generated and completed.
10. Room/bed becomes available only after readiness verification.
11. Admin creates maintenance block; availability excludes inventory.
12. Manager reviews occupancy report.
13. Crew cannot access another employee's booking.
14. Role cannot access unauthorized submenu or API.
15. Roster sync preview and conversion.

## 3. Concurrency tests
- Two users attempt to reserve the final available bed for overlapping dates.
- Two requests with same idempotency key.
- Two roster sync jobs process same source record.
- Check-in QR scanned concurrently twice.
- Allocation reassignment races with a new booking.
Expected: one valid outcome, no duplicate active allocation, consistent audit trail.

## 4. Security tests
- Missing/expired/invalid token.
- Forged role claim.
- IDOR on reservation, room, task and ticket IDs.
- Scope bypass via query filters/export.
- SQL injection and XSS payloads.
- CSRF/session protections according to auth architecture.
- Rate limiting on QR and auth endpoints.
- Upload MIME spoofing and oversized file.
- Secrets/PII leakage in logs.
- Unauthorized self-approval.
- Crew access to admin routes.

## 5. Performance tests
Initial target: 100 virtual users; adjust after real usage profile is known.

Scenarios:
- Dashboard reads.
- Availability search.
- Reservation creation.
- Reservation list pagination.
- Occupancy report.
- Mixed read/write workload.

Measure:
- p50/p95/p99 latency.
- Error rate.
- DB connection saturation.
- CPU/memory.
- Lock wait/deadlock.
- Query count and slow queries.

## 6. Data quality tests
- No orphan allocation.
- No allocation with invalid date range.
- No overlapping active allocation for same bed.
- No checked-out reservation with active stay.
- No room offered while blocked or not ready.
- Roster source ID unique.
- Employee source identity unique.
- KPI reconciles with transaction ledger.

## 7. UI/UX checks
- Desktop, tablet and mobile viewport.
- No horizontal overflow.
- Keyboard navigation and focus.
- Contrast and status labels.
- Loading, empty, error, offline and permission-denied states.
- All buttons and menu items work.
- Forms validate server and client.
- Date/time and timezone consistency.
- Crew Portal and Management Portal remain visually distinct.

## 8. Test data
Use deterministic demo fixtures:
- Demo dormitories clearly labeled `DEMO`.
- Demo buildings, floors, rooms and beds.
- Demo employees with synthetic identifiers.
- Demo roster assignments.
- Avoid real employee personal data in development.
- Seed scripts must be repeatable and safe.

## 9. CI quality gates
- Typecheck.
- Lint.
- Unit tests.
- Integration tests.
- Migration validation.
- Build.
- E2E smoke.
- Dependency/security scan where available.

## 10. Defect severity
- Critical: data leak, unauthorized access, double booking, data corruption, production outage.
- High: core booking/check-in workflow broken, major permission bypass.
- Medium: module workflow impaired with workaround.
- Low: cosmetic or minor usability issue.

Do not declare release candidate with open critical/high defects.
