# WHOOSH STAY — Qoder Project Documentation Pack

**Version:** 1.0.0  
**Status:** Ready for Qoder discovery and implementation  
**Product:** Internal Crew Accommodation & Dormitory Management System  
**Scope:** Full product, hybrid reservation, hybrid hospitality/enterprise UI, autonomous phased execution

## Package contents

| File | Purpose |
|---|---|
| `BRD.md` | Business goals, stakeholders, problems, outcomes, assumptions |
| `PRD.md` | Product scope, personas, user journeys, features, acceptance criteria |
| `SRS.md` | Functional and non-functional software requirements |
| `SYSTEM_ARCHITECTURE.md` | Application architecture, modules, integrations, deployment |
| `DATABASE_SCHEMA.md` | PostgreSQL logical schema, relationships, constraints, indexes |
| `API_SPECIFICATION.md` | REST API conventions, endpoints, payload examples |
| `RBAC_MATRIX.md` | Roles, permissions, data scopes, authorization rules |
| `UI_UX_GUIDELINES.md` | Crew and management experience, navigation, design system |
| `DEVELOPMENT_ROADMAP.md` | Autonomous phases, dependencies, gates, Definition of Done |
| `TESTING_STRATEGY.md` | Unit, integration, E2E, security, concurrency and acceptance tests |
| `AGENTS.md` | Persistent instructions for coding agents |
| `QODER_MASTER_PROMPT.md` | Main instruction to start and run autonomous delivery |
| `OPEN_DECISIONS.md` | Business decisions requiring KCIC stakeholder validation |

## How to use in Qoder

1. Create or open a **new, separate repository** for Whoosh Stay. Do not place it inside Whoosh Health Care unless explicitly required.
2. Copy this entire documentation pack into the repository root, preferably under `/docs` (keep `AGENTS.md` and `QODER_MASTER_PROMPT.md` at root).
3. Open the repository in Qoder.
4. Submit the full contents of `QODER_MASTER_PROMPT.md` as the task instruction. Ask Qoder to read all documents before changing code.
5. Allow autonomous execution by phase. Qoder must keep `docs/IMPLEMENTATION_STATUS.md`, `docs/DECISIONS.md`, and `docs/CHANGELOG.md` updated.
6. Review phase reports and approve real external integrations / production deployment separately.

## Important implementation policy

This pack is a product and engineering baseline, not proof of official KCIC policy. Dormitory inventory, employee eligibility, gender/rooming policy, check-in rules, roster API contracts, SSO configuration, data retention, and approval thresholds must be confirmed by authorized stakeholders.

Qoder may implement configurable defaults and local mock adapters, but **must not invent official KCIC endpoints, credentials, policies, locations, or production data**. Where real integration details are unavailable, build a clean adapter interface and deterministic mock implementation, document the missing inputs, and continue with the rest of the application.

## Baseline technology

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL
- ORM/migrations: Prisma (unless repository discovery demonstrates a better existing standard)
- Authentication: OIDC with ZITADEL adapter; local development auth mock only when explicitly gated
- Storage: MinIO-compatible object storage
- API: REST `/api/v1`, OpenAPI documentation
- Testing: Vitest, Supertest, Playwright
- Runtime: Docker Compose, Nginx
- Optional: Redis for queues/cache only when justified

If the repository already contains an established stack, inspect it first and preserve the working stack unless there is a documented technical reason to change it.
