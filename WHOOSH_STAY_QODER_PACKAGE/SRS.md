# Software Requirements Specification (SRS) — Whoosh Stay

**Version:** 1.0 | **Normative language:** MUST = mandatory; SHOULD = recommended; MAY = optional.

## 1. System context

Whoosh Stay is a separate internal web application with Crew Portal and Management Portal. It owns accommodation inventory, reservations, allocation, stay operations and audit records. Employee and roster information may be mirrored from approved external systems.

## 2. Functional requirements

### FR-AUTH — Identity and access
- FR-AUTH-001: System MUST authenticate users through configured OIDC provider in production.
- FR-AUTH-002: System MUST map authenticated subject to a local user record.
- FR-AUTH-003: System MUST enforce role, permission and data scope on every protected API.
- FR-AUTH-004: System MUST support session expiry and logout.
- FR-AUTH-005: Development mock authentication MUST be disabled by default outside local development.
- FR-AUTH-006: System MUST log privileged access and authorization failures without exposing tokens.

### FR-EMP — Employee directory
- FR-EMP-001: System MUST maintain a local employee reference linked to a stable external employee identifier.
- FR-EMP-002: External sync MUST be idempotent.
- FR-EMP-003: Employee data MUST be limited to operationally required fields.
- FR-EMP-004: Locally sourced employee data MUST be marked with source and last-sync timestamp.
- FR-EMP-005: Crew MUST only access their own profile and reservation data.

### FR-DORM — Dormitory inventory
- FR-DORM-001: Admin MUST create/update/deactivate dormitory locations.
- FR-DORM-002: Dormitory MUST contain buildings; buildings may contain floors; floors contain rooms.
- FR-DORM-003: Rooms MUST contain assignable beds or explicitly modeled capacity units.
- FR-DORM-004: System MUST manage room type, facilities, occupancy policy and operational status.
- FR-DORM-005: System MUST prevent deactivation/deletion that would orphan active stays or historical records.
- FR-DORM-006: System MUST support dormitory-specific manager scope.

### FR-AVAIL — Availability
- FR-AVAIL-001: System MUST calculate availability across the complete requested stay interval.
- FR-AVAIL-002: System MUST exclude beds with overlapping active allocation.
- FR-AVAIL-003: System MUST exclude blocked, inactive, dirty/not-ready or maintenance inventory according to configured rules.
- FR-AVAIL-004: Search results MUST be revalidated within reservation transaction.
- FR-AVAIL-005: Availability MUST account for check-in/check-out boundary semantics consistently.
- FR-AVAIL-006: API MUST return available capacity and reason when inventory is unavailable where safe.

### FR-RES — Reservations
- FR-RES-001: System MUST support manual, roster-generated and admin-created booking sources.
- FR-RES-002: Each reservation MUST have a unique human-readable booking code and UUID.
- FR-RES-003: Reservation MUST record employee/guest, date range, source, status and audit metadata.
- FR-RES-004: System MUST support configurable approval requirements.
- FR-RES-005: System MUST enforce valid state transitions.
- FR-RES-006: Cancellation MUST record actor, timestamp and reason.
- FR-RES-007: System MUST preserve reservation history.
- FR-RES-008: System MUST prevent duplicate roster-generated requests using source identifiers/idempotency.
- FR-RES-009: A confirmed reservation MUST NOT be silently altered by roster updates.
- FR-RES-010: System MUST support no-show recording under authorized policy.
- FR-RES-011: Crew MUST see only their own reservations.
- FR-RES-012: System SHOULD support group reservation with individual guest records and bed allocations.

### FR-ALLOC — Allocation
- FR-ALLOC-001: System MUST allocate assignable beds, not just room labels.
- FR-ALLOC-002: Allocation MUST validate eligibility, occupancy policy, date overlap, capacity and readiness.
- FR-ALLOC-003: System MUST support allocation preview/dry-run.
- FR-ALLOC-004: Execute MUST be transactional.
- FR-ALLOC-005: Manual override MUST require specific permission and reason.
- FR-ALLOC-006: Reassignment MUST retain previous allocation history.
- FR-ALLOC-007: System MUST prevent overlapping active allocations for the same bed.
- FR-ALLOC-008: Failed allocation MUST create an actionable exception, not silently discard demand.

### FR-STAY — Check-in/out
- FR-STAY-001: System MUST support QR and authorized manual lookup.
- FR-STAY-002: QR token MUST be random, time-limited, single-use and stored as a hash.
- FR-STAY-003: Check-in MUST validate reservation, employee, allocation and allowed time window.
- FR-STAY-004: Duplicate check-in MUST be rejected safely.
- FR-STAY-005: Check-out MUST require an active stay.
- FR-STAY-006: Check-out MUST trigger room/bed readiness workflow.
- FR-STAY-007: Actual check-in/out timestamps MUST be stored as timestamptz.
- FR-STAY-008: Exceptions MUST be auditable.

### FR-HK — Housekeeping
- FR-HK-001: System MUST create or allow creation of cleaning tasks.
- FR-HK-002: Tasks MUST support assignment, status, checklist, notes and evidence.
- FR-HK-003: Room/bed MUST not become bookable until required readiness status is met.
- FR-HK-004: Completion and verification MUST be separately recorded where configured.

### FR-MTN — Maintenance
- FR-MTN-001: System MUST record maintenance ticket category, priority, location, description and status.
- FR-MTN-002: Authorized users MUST be able to block affected room/bed inventory.
- FR-MTN-003: Maintenance closure MUST not automatically reopen inventory unless readiness policy passes.
- FR-MTN-004: Attachments MUST be stored using controlled object storage.

### FR-ROSTER — Roster integration
- FR-ROSTER-001: System MUST define an adapter boundary for external roster source.
- FR-ROSTER-002: Only finalized/approved roster assignments may trigger accommodation evaluation.
- FR-ROSTER-003: Sync MUST be idempotent and have run logs.
- FR-ROSTER-004: System MUST support dry-run/preview and exception queue.
- FR-ROSTER-005: Policy engine MUST calculate accommodation windows from configurable rules.
- FR-ROSTER-006: Roster changes MUST trigger re-evaluation and notification/exception as configured.
- FR-ROSTER-007: Integration outage MUST not block manual booking.
- FR-ROSTER-008: No production endpoint or credential may be fabricated.

### FR-NOTIF — Notifications
- FR-NOTIF-001: System MUST support in-app notifications.
- FR-NOTIF-002: Email/Telegram MAY be enabled through configurable providers.
- FR-NOTIF-003: Delivery attempts and outcomes MUST be logged.
- FR-NOTIF-004: Templates MUST support safe variable substitution.
- FR-NOTIF-005: Notification failure MUST not roll back a successful reservation.

### FR-REPORT — Reporting
- FR-REPORT-001: System MUST provide occupancy, reservation, usage, arrival/departure, housekeeping and maintenance reports.
- FR-REPORT-002: Reports MUST apply the same RBAC/data scope as source data.
- FR-REPORT-003: Exports MUST validate filters and prevent formula injection in spreadsheets.
- FR-REPORT-004: KPI definitions MUST be documented.
- FR-REPORT-005: Reports SHOULD support XLSX and PDF export.

### FR-AUDIT — Audit and configuration
- FR-AUDIT-001: System MUST audit reservation, approval, allocation, check-in/out, inventory status, user/role and policy changes.
- FR-AUDIT-002: Audit records MUST include actor, action, entity, timestamp, request/correlation ID and safe before/after values.
- FR-AUDIT-003: Audit records MUST not contain secrets or full QR tokens.
- FR-CONF-001: System MUST support configurable reservation policies and approval rules.
- FR-CONF-002: Changes to critical policies MUST be permission-protected and audited.

## 3. Reservation state model

Suggested states:
- DRAFT
- PENDING_APPROVAL
- CONFIRMED
- CHECKED_IN
- CHECKED_OUT
- CANCELLED
- REJECTED
- NO_SHOW
- EXCEPTION

Allowed transitions must be explicitly implemented. Examples:
- DRAFT → PENDING_APPROVAL or CONFIRMED
- PENDING_APPROVAL → CONFIRMED or REJECTED or CANCELLED
- CONFIRMED → CHECKED_IN or CANCELLED or NO_SHOW
- CHECKED_IN → CHECKED_OUT
- EXCEPTION → a permitted recovery state after authorized resolution

Do not permit arbitrary status PATCH. Use domain commands/endpoints.

## 4. Inventory and availability semantics

- Stay interval is `[check_in_date, check_out_date)`; check-out date is not an occupied night.
- Bed allocation conflicts when intervals overlap: existing.start < requested.end AND requested.start < existing.end.
- Inventory readiness is separate from reservation status.
- A room may have some beds available while other beds are occupied, blocked or dirty.
- For group reservations, all required allocations SHOULD commit atomically unless business explicitly permits partial fulfillment.
- Use database transactions and constraints/locking to protect concurrency.

## 5. Non-functional requirements

### Performance
- Baseline target: 100 virtual concurrent users for initial load test.
- Standard API p95 target ≤ 500 ms under agreed test dataset/load, excluding external providers.
- Availability search p95 target ≤ 2 s under agreed load.
- Dashboard initial interactive load target ≤ 3 s on supported office network.
- Pagination default 10–15 rows; never fetch unbounded transaction tables.
- Performance targets are test objectives, not guarantees before measurement.

### Security and privacy
- HTTPS in deployed environments.
- OIDC authorization code flow with PKCE for browser clients.
- Validate issuer, audience, signature, expiry and nonce/state.
- Backend authorization on every endpoint.
- Least privilege and tenant/location scope where applicable.
- Secure cookies/session strategy; no long-lived access token in localStorage where avoidable.
- Input validation, parameterized queries, output encoding and upload validation.
- Rate limiting for authentication, QR and sensitive endpoints.
- Secrets via environment/secret manager, never committed.
- Minimize employee personal data.
- Define retention and deletion policy with stakeholders.
- Protect logs from PII/token leakage.

### Reliability
- Manual booking works when external roster/employee services are down, using last valid employee mirror and configured policy.
- Idempotency for retryable write operations.
- Database backups and tested restore procedure.
- Health/readiness endpoints.
- Graceful integration timeouts and retries with backoff.
- No lost transaction on notification provider failure.

### Accessibility and usability
- Responsive desktop/tablet/mobile.
- Keyboard navigable management interfaces.
- Visible focus, labels, error messages and sufficient contrast.
- Indonesian language initially; structure should permit future i18n.
- Use consistent date/time display in Asia/Jakarta while storing timestamps with timezone.

## 6. Data validation
- UUIDs validated.
- Date range valid.
- Capacity positive integer.
- Phone/email format validated where collected.
- Uploaded files checked for type, size and malware scanning integration where available.
- Employee identifier uniqueness based on approved external key.
- No direct trust of client-supplied role, employee ID or price/capacity.

## 7. Error handling
- Use consistent error envelope and stable error codes.
- 409 for booking/allocation conflict.
- 403 for permission/scope failure.
- 422 for business validation.
- Return correlation/request ID.
- Do not leak stack traces or database details to clients.

## 8. Operational requirements
- Docker Compose local environment.
- Database migration and seed scripts.
- OpenAPI docs.
- Structured logs.
- Backup/restore instructions.
- Environment variable reference.
- Deployment runbook and rollback plan.
