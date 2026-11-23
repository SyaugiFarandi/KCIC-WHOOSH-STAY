# Open Decisions and Assumptions — Whoosh Stay

This file separates implementation defaults from policy decisions that require authorized KCIC confirmation.

## 1. Safe defaults Qoder may implement

| Topic | Development default | Production condition |
|---|---|---|
| Accommodation scope | Internal dormitory only | Confirm inventory and operator |
| Reservation | Hybrid manual + roster-assisted | Confirm operational workflow |
| Roster automation | Recommendation / pending by default | Enable auto-confirm only after approval |
| Approval | Configurable; admin approval default | Confirm role and thresholds |
| Room assignment | Bed-level allocation | Confirm rooming rules |
| Availability interval | Check-in inclusive, check-out exclusive | Confirm local operational policy |
| Employee matching | Stable source employee ID | Confirm official identifier |
| SSO | OIDC adapter | Supply approved ZITADEL configuration |
| External APIs | Mock adapters | Supply official API contracts |
| Notifications | In-app active; email/Telegram adapter optional | Supply credentials and recipients |
| QR | Short-lived single-use token | Confirm front desk verification policy |
| Language | Indonesian UI | Confirm localization needs |

## 2. Stakeholder decisions required

1. Official dormitory list, addresses, stations and ownership.
2. Building/floor/room/bed inventory and capacity.
3. Employee eligibility: roles, employment statuses and exceptions.
4. Gender/rooming policy and any accommodation restrictions.
5. Rules for stay before/after duty, lead time, maximum duration and extension.
6. Whether a crew member can book for other crew members.
7. Group reservation and shared-room rules.
8. Approval hierarchy and separation of duties.
9. Cancellation deadline, no-show and late arrival policy.
10. Check-in/check-out operational windows.
11. Required identity verification at front desk.
12. Housekeeping readiness checklist and who verifies.
13. Maintenance severity and blocking criteria.
14. Official employee API and roster API documentation.
15. ZITADEL issuer, client, scopes, redirect URIs and environment.
16. Email/Telegram provider and recipient policy.
17. Data retention, privacy notice and audit retention.
18. Export permissions and report recipients.
19. Production infrastructure, backup RPO/RTO and monitoring requirements.

## 3. No fabrication policy

Qoder must not:
- Invent official KCIC dormitory names or addresses.
- Invent employee/roster API URLs or credentials.
- Invent real employees or use real PII in seed data.
- Treat assumed rooming rules as official policy.
- Enable automatic booking in production without approval.
- Deploy to production or connect to live systems without explicit authorization.

## 4. Decision log format

Record decisions in `docs/DECISIONS.md` with:
- ID
- Date
- Decision
- Context
- Options considered
- Consequences
- Approver/source
- Status (proposed/approved/rejected)
