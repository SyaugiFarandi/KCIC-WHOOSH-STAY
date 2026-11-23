# System Architecture — Whoosh Stay

## 1. Architecture decisions

- Separate application/repository from Whoosh Health Care.
- Modular monolith for initial delivery; do not prematurely split into microservices.
- API-first backend with explicit domain services.
- Crew Portal and Management Portal share API and design primitives but have separate layouts/navigation.
- PostgreSQL is the system of record.
- External systems are accessed through adapters.
- Use asynchronous jobs for roster sync, notification delivery and exports when needed.
- Keep all critical reservation/allocation logic server-side.

## 2. Logical architecture

```text
Browser / Mobile Web
  ├── Crew Portal (React)
  └── Management Portal (React)
          |
          | HTTPS / REST / optional Socket.IO
          v
API Gateway / Nginx
          |
          v
Node.js + Express API
  ├── Auth & Access
  ├── Employee Directory
  ├── Dormitory Inventory
  ├── Availability
  ├── Reservation
  ├── Allocation
  ├── Stay Operations
  ├── Housekeeping
  ├── Maintenance
  ├── Roster Integration
  ├── Notifications
  ├── Reporting
  └── Audit & Configuration
          |
          +---- PostgreSQL
          +---- MinIO
          +---- Optional Redis / Worker
          |
          +---- ZITADEL OIDC adapter
          +---- Employee API adapter
          +---- Roster API adapter
          +---- Email/Telegram providers
```

## 3. Suggested repository structure

```text
whoosh-stay/
  AGENTS.md
  QODER_MASTER_PROMPT.md
  docs/
    BRD.md
    PRD.md
    SRS.md
    SYSTEM_ARCHITECTURE.md
    DATABASE_SCHEMA.md
    API_SPECIFICATION.md
    RBAC_MATRIX.md
    UI_UX_GUIDELINES.md
    DEVELOPMENT_ROADMAP.md
    TESTING_STRATEGY.md
    OPEN_DECISIONS.md
  frontend/
    src/
      app/
      layouts/
      components/
      modules/
      services/
      hooks/
      routes/
      styles/
  backend/
    src/
      config/
      shared/
      modules/
        auth/
        users/
        employees/
        dormitories/
        inventory/
        availability/
        reservations/
        allocation/
        stays/
        housekeeping/
        maintenance/
        roster-integration/
        notifications/
        reports/
        audit/
      database/
      jobs/
  infrastructure/
    docker/
    nginx/
  scripts/
  docker-compose.yml
  .env.example
```

## 4. Module boundaries

Each backend module should expose a public service/facade. Cross-module imports must go through that public interface, not reach into another module's private files.

- `employees`: employee mirror and eligibility profile.
- `dormitories`: property/building/floor/room/bed/facilities.
- `availability`: read model/calculation; no independent booking writes.
- `reservations`: lifecycle and state transitions.
- `allocation`: bed assignment, conflict protection and history.
- `stays`: check-in/out and actual occupancy.
- `housekeeping`: task and readiness workflow.
- `maintenance`: ticket and inventory block.
- `roster-integration`: external adapter, sync, mapping, exceptions.
- `notifications`: templates and provider delivery.
- `reports`: scoped read-only aggregation/export.
- `audit`: append-only event records.

## 5. Reservation transaction boundary

Reservation creation and bed allocation must be consistent:
1. Validate user/employee and policy.
2. Begin database transaction.
3. Lock relevant bed/inventory rows or rely on robust exclusion constraints.
4. Recalculate date-range availability.
5. Create reservation and guest records.
6. Create allocation rows if allocation is part of the current workflow.
7. Write reservation history and audit event.
8. Commit.
9. Dispatch notifications asynchronously.

If any required allocation fails, roll back the transaction. Never trust a previous search response as proof of availability.

## 6. Roster integration design

Define interfaces such as:
- `EmployeeDirectoryProvider.getEmployee(externalId)`
- `RosterProvider.fetchFinalizedAssignments(cursor/dateRange)`
- `RosterMapper.mapExternalAssignment(payload)`
- `AccommodationPolicy.evaluate(assignment, employee)`
- `RosterReconciliationService.reconcile(assignment)`

Provide:
- `MockEmployeeProvider`
- `MockRosterProvider`
- future `KcicEmployeeProvider` and `KcicRosterProvider` only after official contracts are supplied.

Store external source identifiers, payload version/hash where appropriate, sync timestamps and run logs. Avoid storing unnecessary raw personal data.

## 7. Authentication design

Production:
- OIDC Authorization Code + PKCE.
- Validate ID/access tokens at appropriate trust boundary.
- Map `sub` to local user identity.
- Use backend-issued session or secure token strategy.
- Do not accept roles from arbitrary client claims without trusted mapping.
- Local development auth must be isolated by `NODE_ENV` and explicit feature flag.

## 8. Storage

MinIO for:
- Dormitory/property images.
- Room images.
- Maintenance evidence.
- Housekeeping evidence.
- Export artifacts if persisted.

Store object key, MIME type, size, checksum, owner and access policy in DB. Use short-lived signed URLs. Do not expose public buckets by default.

## 9. Real-time updates

Socket.IO MAY be used for operational updates:
- Reservation queue changes.
- Check-in/out activity.
- Room readiness.
- Occupancy dashboard refresh.

Use REST as source of truth. Socket events are notifications, not authoritative writes. Reconnect must refresh state via API.

## 10. Observability

- Structured JSON logs.
- Correlation ID per request.
- Health `/health/live` and `/health/ready`.
- Integration sync metrics.
- Reservation conflict metrics.
- Job failure and retry metrics.
- Redact secrets and personal data.

## 11. Deployment

Local:
- frontend
- backend
- postgres
- minio
- optional redis/worker
- nginx optional

Production must use approved infrastructure, TLS, secrets management, backups, monitoring and access controls. Do not deploy to KCIC production without explicit authorization.
