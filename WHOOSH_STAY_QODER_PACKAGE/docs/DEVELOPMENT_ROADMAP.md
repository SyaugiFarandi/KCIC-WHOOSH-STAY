# Development Roadmap — Whoosh Stay

## 1. Delivery approach

Qoder executes autonomously in phases, but each phase has a verification gate. Autonomous does not mean skipping tests or making unapproved external changes.

### Phase 0 — Repository discovery and plan
Tasks:
- Inspect repository and environment.
- Identify existing code, stack, scripts and conventions.
- Read all specification files.
- Produce architecture plan, risk list and requirement traceability matrix.
- Identify conflicts/gaps and record decisions.
Gate: no destructive change; plan and assumptions documented.

### Phase 1 — Foundation
Tasks:
- Initialize or align frontend/backend TypeScript projects.
- Configure lint, formatting, test runner and environment validation.
- Docker Compose for PostgreSQL and MinIO.
- Database migrations and seed framework.
- OIDC abstraction and local development auth mode.
- Users, roles, permissions, employee mirror.
- Shared UI shell and design tokens.
Gate: app starts locally; migrations run cleanly; RBAC tests pass.

### Phase 2 — Dormitory inventory
Tasks:
- Dormitory, building, floor, room, bed and facility CRUD.
- Inventory status and block model.
- Management list/detail/form pages.
- Crew-facing dormitory browse cards and detail pages.
Gate: CRUD, validation, scope and audit tests pass.

### Phase 3 — Reservation and allocation core
Tasks:
- Availability calculation.
- Manual booking.
- Approval workflow.
- Reservation state machine.
- Bed allocation engine.
- Transactional conflict prevention.
- Cancellation and history.
Gate: concurrency test proves same bed cannot be double allocated; full manual journey passes E2E.

### Phase 4 — Stay operations
Tasks:
- QR token lifecycle.
- Front desk check-in/out.
- Active occupant view.
- Room readiness workflow.
- Housekeeping tasks and verification.
- Maintenance ticket and inventory blocking.
Gate: stay lifecycle E2E and inventory readiness tests pass.

### Phase 5 — Roster-assisted automation
Tasks:
- Employee/roster provider interfaces.
- Deterministic mock providers and sample data.
- Sync logs, idempotency and reconciliation.
- Accommodation policy engine.
- Recommendation preview and exception queue.
- Controlled conversion to reservation.
Gate: repeat sync produces no duplicate; external integration remains feature-flagged until real contract is supplied.

### Phase 6 — Notifications, reporting and analytics
Tasks:
- In-app notification center.
- Provider adapters for email/Telegram, disabled until configured.
- Reports and scoped exports.
- Dashboard analytics and calendar.
Gate: export scope tests and delivery failure tests pass.

### Phase 7 — Hardening and release candidate
Tasks:
- Full E2E regression.
- Security review.
- Performance test baseline at 100 VU.
- Accessibility/responsive audit.
- Backup/restore drill.
- Docker production profile and deployment docs.
- UAT checklist and release notes.
Gate: no unresolved critical/high defects; stakeholder-specific decisions clearly listed.

## 2. Priority
- P0: identity, RBAC, inventory, availability, reservation, allocation, check-in/out.
- P1: housekeeping, maintenance, roster recommendation, notifications, reports.
- P2: advanced analytics, optional real-time updates, advanced optimization.

Full product scope means all modules are implemented; phased delivery is used to preserve quality.

## 3. Autonomous execution rules
- Work sequentially by dependency.
- Do not stop after generating a plan; begin implementation unless a true blocker exists.
- Do not ask the user for routine decisions that can safely be represented as configurable assumptions.
- Ask only when a decision affects security, production access, official policy or irreversible action.
- Use mock adapters for unavailable external systems.
- Keep app runnable after each phase.
- Update `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`, `docs/CHANGELOG.md`.
- Run relevant tests after each meaningful change.
- Never claim tests passed unless executed and results recorded.
- Never mark a module complete while its key UI actions are placeholders.
- Avoid unrelated refactors.

## 4. Definition of Done per feature
- Requirements mapped to implementation.
- Backend validation and authorization present.
- UI states implemented.
- Migrations and seed data updated.
- Unit/integration tests added.
- E2E test added for critical journey.
- Error and empty states handled.
- Documentation updated.
- No known critical regression.

## 5. Release gates
- Gate A: local startup and migrations.
- Gate B: RBAC and inventory correctness.
- Gate C: reservation concurrency correctness.
- Gate D: complete stay lifecycle.
- Gate E: roster idempotency and exception handling.
- Gate F: security/performance/UAT readiness.

## 6. Time estimation
Do not invent a calendar commitment before repository discovery and stakeholder availability. Qoder should estimate effort after breaking work into tasks and identify uncertainty explicitly.
