# AGENTS.md — Whoosh Stay Agent Instructions

## Mission
Build and maintain Whoosh Stay as a complete, production-minded internal crew accommodation platform. Follow all product and engineering documents in `/docs`.

## Mandatory first actions
1. Inspect the existing repository before changing anything.
2. Read `README.md`, `QODER_MASTER_PROMPT.md`, and every file in `/docs`.
3. Identify existing stack, scripts, conventions, tests and deployment setup.
4. Create/update:
   - `docs/IMPLEMENTATION_STATUS.md`
   - `docs/DECISIONS.md`
   - `docs/CHANGELOG.md`
   - `docs/REQUIREMENT_TRACEABILITY.md`
5. Produce a phased plan, then begin Phase 1 without waiting for routine approval.

## Architecture rules
- Keep Whoosh Stay separate from Whoosh Health Care.
- Prefer modular monolith and explicit module facades.
- Keep business logic in backend domain/service layer.
- Frontend must not be the authority for eligibility, availability, allocation or permissions.
- Use PostgreSQL migrations; do not manually mutate production schema.
- Use transactions for reservation/allocation/stay state changes.
- Use adapter interfaces for SSO, employee, roster, storage and notification providers.
- Do not fabricate external APIs or secrets.
- Use synthetic demo data only.
- Keep external integrations behind feature flags.

## Code quality
- TypeScript strict mode where practical.
- Validate environment variables at startup.
- Centralize error handling and API response format.
- Use parameterized queries/ORM safely.
- Use explicit DTO/schema validation.
- Avoid giant components and god services.
- Add tests with every business rule.
- Keep module boundaries enforced.
- Avoid unnecessary dependencies.
- Never commit `.env`, tokens, passwords or private keys.

## Security
- Deny by default.
- Enforce RBAC and record-level scope on backend.
- Do not trust client employee ID, role, scope or reservation status.
- Protect QR tokens; store hashes, expire and consume once.
- Redact personal data and secrets from logs.
- Apply authorization to exports and attachments.
- No production deployment or live integration without explicit authorization.

## Product behavior
- Crew Portal must be hospitality-first.
- Management Portal must be enterprise-operational.
- Implement the agreed eight management modules plus profile.
- All visible controls must work; no dead links or fake success states.
- Pending approval must never be shown as confirmed.
- Availability must be rechecked transactionally on write.
- A room/bed must not become available until housekeeping/readiness conditions pass.
- Roster changes must not silently modify confirmed bookings.

## Autonomous execution
- Execute roadmap phases sequentially.
- Continue through implementation, tests and fixes; do not stop after planning.
- Ask only for security-sensitive, irreversible, production or official-policy decisions.
- If external information is missing, implement mock adapter and document exact input required.
- Keep local app runnable after each phase.
- Update status, decisions, changelog and traceability continuously.
- Report blockers precisely, including file/path, error, impact and safe workaround.

## Verification
Before claiming completion:
- Run typecheck, lint, unit, integration and relevant E2E tests.
- Verify migrations from a clean database.
- Verify Docker Compose startup.
- Verify core crew and management journeys.
- Verify RBAC denial cases and concurrency tests.
- Record actual command and result.
- Distinguish implemented, tested, partially tested and not verified.

## Prohibited shortcuts
- Do not use mock UI data as if it were live backend data.
- Do not leave critical buttons inert.
- Do not bypass backend authorization.
- Do not weaken tests to hide failures.
- Do not drop data or rewrite migrations destructively.
- Do not add unrequested public marketplace/payment/driver tracking scope.
