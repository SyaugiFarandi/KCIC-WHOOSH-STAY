# RBAC Matrix — Whoosh Stay

## 1. Roles

| Code | Role | Purpose |
|---|---|---|
| `SYSTEM_ADMIN` | System Administrator | Technical configuration, users, roles, integrations |
| `DORMITORY_MANAGER` | Dormitory Manager | Cross-location operational oversight and approvals |
| `DORMITORY_ADMIN` | Dormitory Admin | Manage assigned dormitories and reservations |
| `FRONT_DESK` | Front Desk | Arrival/departure verification |
| `HOUSEKEEPING` | Housekeeping | Assigned cleaning tasks |
| `MAINTENANCE` | Maintenance Officer | Assigned maintenance tickets |
| `CREW` | Crew / Employee | Own accommodation requests and stays |
| `AUDITOR` | Auditor / Viewer | Read-only authorized records |

Roles are permission bundles. Users may have more than one role only where approved. Data scope is assigned separately.

## 2. Permission catalog

Use explicit permission codes:
- `dashboard.read`
- `dormitories.read`, `dormitories.create`, `dormitories.update`, `dormitories.deactivate`
- `buildings.manage`
- `floors.manage`
- `rooms.read`, `rooms.create`, `rooms.update`, `rooms.status.manage`
- `beds.manage`
- `facilities.manage`
- `availability.read`
- `reservations.read`, `reservations.create`, `reservations.update`
- `reservations.approve`, `reservations.reject`, `reservations.cancel`, `reservations.no_show`
- `allocations.read`, `allocations.execute`, `allocations.override`, `allocations.reassign`
- `stays.read`, `stays.check_in`, `stays.check_out`
- `housekeeping.read`, `housekeeping.assign`, `housekeeping.execute`, `housekeeping.verify`
- `maintenance.read`, `maintenance.create`, `maintenance.assign`, `maintenance.update`, `maintenance.block_inventory`, `maintenance.close`
- `roster.read`, `roster.sync`, `roster.preview`, `roster.convert`, `roster.resolve_exception`
- `reports.read`, `reports.export`
- `employees.read`
- `users.manage`, `roles.manage`, `policies.manage`, `notifications.manage`
- `audit.read`

## 3. Baseline role matrix

Legend: R=read, C=create, U=update, A=approve/execute, X=admin/manage, Own=own records, Assigned=assigned tasks/scope.

| Module | System Admin | Manager | Dorm Admin | Front Desk | Housekeeping | Maintenance | Crew | Auditor |
|---|---|---|---|---|---|---|---|---|
| Dashboard | R | R | R | Limited R | Assigned R | Assigned R | Own summary | R |
| Dormitory master | X | R | X scoped | R scoped | R assigned | R assigned | - | R |
| Room/bed master | X | R | X scoped | R scoped | R assigned | R assigned | Availability only | R |
| Reservations | X | R/A | C/R/U/A scoped | R scoped | - | - | C/R/U Own | R |
| Allocation | X | R/A | C/R/U/A scoped | R scoped | - | - | R Own | R |
| Check-in/out | X | R | R/A | C/R/U | - | - | R Own | R |
| Housekeeping | X | R | R/A | R | C/R/U assigned | - | - | R |
| Maintenance | X | R | R/A | C (report only) | C (report only) | C/R/U assigned | C (report only) | R |
| Roster integration | X | R | R/preview scoped | - | - | - | Own suggestions | R |
| Reports | X | R | R scoped | Limited R | Assigned R | Assigned R | Own history | R |
| User/RBAC | X | R | - | - | - | - | - | - |
| Policies/templates | X | R | Limited by permission | - | - | - | - | R |
| Audit logs | X | R | R scoped | - | - | - | - | R |

This is a baseline; management must approve final role responsibilities.

## 4. Data scopes

- `GLOBAL`: all authorized dormitory data.
- `DORMITORY`: only assigned dormitory IDs.
- `BUILDING`: only assigned building IDs.
- `ASSIGNED_TASK`: only tasks/tickets assigned to the user.
- `SELF`: own employee profile, reservations and stay history.

A user can have a role with a scope. Backend query builders/services must apply scope predicates. Hiding a menu is not authorization.

## 5. Crew restrictions

Crew:
- Can search eligible inventory.
- Can create own reservation.
- Can view own reservation and own stay history.
- Can cancel own reservation only within configured policy and state.
- Cannot approve own request.
- Cannot allocate beds or alter assigned room.
- Cannot query other employees by arbitrary ID.
- Cannot access dormitory management, roster sync, admin reports or audit logs.

## 6. Separation of duties

- A user should not approve their own reservation where approval is required.
- Front desk can verify stays but cannot edit reservation policies.
- Housekeeping can complete assigned cleaning tasks but cannot approve reservations.
- Maintenance can block inventory within its assigned scope but cannot clear readiness without required verification.
- System Admin access should be limited and audited.
- Auditor is read-only.

## 7. Authorization implementation requirements

1. Central permission catalog.
2. Server middleware/service authorization.
3. Scope resolution from trusted database role assignments.
4. No client-supplied role/scope trust.
5. API tests for allowed and denied paths.
6. Object-level authorization on every record endpoint.
7. Export endpoints apply same scope as list endpoints.
8. Audit sensitive permission changes.
9. Deny by default.
10. Include permission and scope tests in CI.
