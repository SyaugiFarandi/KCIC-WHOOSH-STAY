# Database Schema — Whoosh Stay

**Database:** PostgreSQL | **Primary key:** UUID | **Time:** TIMESTAMPTZ stored in UTC; display in Asia/Jakarta.

This is the logical baseline. Qoder must translate it into normalized migrations, indexes, constraints and ORM models. Do not put all data in JSONB; JSONB is reserved for flexible metadata/configuration.

## 1. Conventions
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`.
- `created_at`, `updated_at` as `timestamptz NOT NULL DEFAULT now()`.
- Use `created_by`, `updated_by` where accountability is needed.
- Prefer status enums or constrained varchar values with migrations.
- Business transactions are soft-cancelled/state-transitioned, not hard-deleted.
- External identifiers must be namespaced by source.
- Add `version` integer for optimistic concurrency where useful.

## 2. Identity and access

### users
- id UUID PK
- oidc_issuer varchar(255)
- oidc_subject varchar(255)
- employee_id UUID nullable FK employees
- email varchar(255)
- display_name varchar(150)
- status varchar(30)
- last_login_at timestamptz
- created_at, updated_at
Unique `(oidc_issuer, oidc_subject)`.

### roles
- id UUID PK
- code varchar(50) UNIQUE
- name varchar(100)
- description text
- is_system boolean

### permissions
- id UUID PK
- code varchar(100) UNIQUE
- module varchar(50)
- action varchar(50)
- description text

### user_roles
- user_id UUID FK users
- role_id UUID FK roles
- scope_type varchar(30) (GLOBAL, DORMITORY, BUILDING)
- scope_id UUID nullable
- PK `(user_id, role_id, scope_type, scope_id)` or surrogate key with matching unique constraint.

### role_permissions
- role_id UUID FK roles
- permission_id UUID FK permissions
- PK `(role_id, permission_id)`.

## 3. Employee and source data

### employees
- id UUID PK
- source_system varchar(50)
- external_employee_id varchar(100)
- employee_code varchar(50)
- full_name varchar(150)
- work_email varchar(255) nullable
- department_code varchar(50) nullable
- department_name varchar(150) nullable
- position_code varchar(50) nullable
- position_name varchar(150) nullable
- home_station_code varchar(50) nullable
- employment_status varchar(30)
- eligibility_status varchar(30) DEFAULT 'UNKNOWN'
- source_updated_at timestamptz nullable
- synced_at timestamptz nullable
- created_at, updated_at
Unique `(source_system, external_employee_id)`. Do not use national ID as the default matching key.

### employee_sync_logs
- id UUID PK
- source_system varchar(50)
- started_at, finished_at timestamptz
- status varchar(30)
- fetched_count integer
- inserted_count integer
- updated_count integer
- failed_count integer
- error_summary text nullable
- initiated_by UUID nullable FK users

## 4. Dormitory inventory

### dormitories
- id UUID PK
- code varchar(40) UNIQUE
- name varchar(150)
- description text nullable
- address text nullable
- latitude numeric(10,7) nullable
- longitude numeric(10,7) nullable
- station_code varchar(50) nullable
- contact_name varchar(150) nullable
- contact_phone varchar(40) nullable
- status varchar(30)
- created_at, updated_at, created_by, updated_by

### buildings
- id UUID PK
- dormitory_id UUID FK dormitories
- code varchar(40)
- name varchar(150)
- status varchar(30)
Unique `(dormitory_id, code)`.

### floors
- id UUID PK
- building_id UUID FK buildings
- floor_number integer
- name varchar(100)
Unique `(building_id, floor_number)`.

### room_types
- id UUID PK
- code varchar(40) UNIQUE
- name varchar(100)
- description text nullable
- default_capacity integer CHECK > 0
- status varchar(30)

### rooms
- id UUID PK
- floor_id UUID FK floors
- room_type_id UUID FK room_types
- room_number varchar(40)
- name varchar(100) nullable
- description text nullable
- gender_policy varchar(30) DEFAULT 'UNSPECIFIED'
- operational_status varchar(30) (ACTIVE, INACTIVE, MAINTENANCE, BLOCKED)
- housekeeping_status varchar(30) (READY, DIRTY, CLEANING, INSPECTION_REQUIRED)
- status_reason text nullable
- created_at, updated_at
Unique `(floor_id, room_number)`.

### beds
- id UUID PK
- room_id UUID FK rooms
- bed_code varchar(40)
- label varchar(80) nullable
- status varchar(30) (ACTIVE, INACTIVE, BLOCKED)
Unique `(room_id, bed_code)`.

### facilities
- id UUID PK
- code varchar(50) UNIQUE
- name varchar(100)
- description text nullable
- status varchar(30)

### room_facilities
- room_id UUID FK rooms
- facility_id UUID FK facilities
- quantity integer nullable
- notes text nullable
- PK `(room_id, facility_id)`.

### inventory_blocks
- id UUID PK
- room_id UUID nullable FK rooms
- bed_id UUID nullable FK beds
- start_at timestamptz
- end_at timestamptz
- block_type varchar(30) (MAINTENANCE, CLEANING, ADMIN_BLOCK, OTHER)
- reason text
- source_ticket_id UUID nullable
- created_by UUID FK users
- created_at timestamptz
Constraint: exactly one of room_id or bed_id must be set; end_at > start_at.

## 5. Reservations and allocation

### reservations
- id UUID PK
- booking_code varchar(40) UNIQUE NOT NULL
- primary_employee_id UUID FK employees
- dormitory_id UUID FK dormitories
- source varchar(20) (MANUAL, ROSTER, ADMIN)
- source_reference varchar(150) nullable
- idempotency_key varchar(150) nullable
- check_in_date date NOT NULL
- check_out_date date NOT NULL
- occupant_count integer NOT NULL CHECK > 0
- purpose text nullable
- status varchar(30)
- approval_status varchar(30)
- requested_at timestamptz
- confirmed_at timestamptz nullable
- cancelled_at timestamptz nullable
- cancellation_reason text nullable
- approved_by UUID nullable FK users
- approved_at timestamptz nullable
- created_by UUID nullable FK users
- created_at, updated_at
CHECK `(check_out_date > check_in_date)`.
Unique idempotency scope e.g. `(source, idempotency_key)` where key not null.

### reservation_guests
- id UUID PK
- reservation_id UUID FK reservations
- employee_id UUID FK employees
- guest_role varchar(30) (PRIMARY, ADDITIONAL)
- created_at
Unique `(reservation_id, employee_id)`.

### bed_allocations
- id UUID PK
- reservation_id UUID FK reservations
- reservation_guest_id UUID FK reservation_guests
- bed_id UUID FK beds
- stay_start date NOT NULL
- stay_end date NOT NULL
- status varchar(30) (HELD, ACTIVE, RELEASED, CANCELLED)
- allocated_at timestamptz
- released_at timestamptz nullable
- allocated_by UUID nullable FK users
CHECK `stay_end > stay_start`.
Prevent overlapping active/held intervals for same bed using PostgreSQL `daterange` exclusion constraint with GiST (enable `btree_gist`) or an equivalent transaction-safe locking strategy. Ensure cancelled/released allocations are excluded.

### reservation_events
- id UUID PK
- reservation_id UUID FK reservations
- event_type varchar(50)
- from_status varchar(30) nullable
- to_status varchar(30) nullable
- reason text nullable
- actor_user_id UUID nullable FK users
- metadata jsonb
- created_at timestamptz

### reservation_approvals
- id UUID PK
- reservation_id UUID FK reservations
- step_number integer
- approver_role_code varchar(50)
- approver_user_id UUID nullable FK users
- status varchar(30)
- decision_at timestamptz nullable
- comments text nullable
Unique `(reservation_id, step_number)`.

## 6. Actual stays

### checkin_records
- id UUID PK
- reservation_id UUID FK reservations
- employee_id UUID FK employees
- checked_in_at timestamptz
- verified_by UUID FK users
- verification_method varchar(30) (QR, MANUAL)
- notes text nullable
Unique `(reservation_id, employee_id)`.

### checkout_records
- id UUID PK
- reservation_id UUID FK reservations
- employee_id UUID FK employees
- checked_out_at timestamptz
- verified_by UUID FK users
- room_condition varchar(30)
- notes text nullable
Unique `(reservation_id, employee_id)`.

### qr_tokens
- id UUID PK
- reservation_id UUID FK reservations
- employee_id UUID FK employees
- token_hash varchar(255) UNIQUE
- expires_at timestamptz
- consumed_at timestamptz nullable
- created_at timestamptz

## 7. Housekeeping and maintenance

### housekeeping_tasks
- id UUID PK
- room_id UUID FK rooms
- bed_id UUID nullable FK beds
- reservation_id UUID nullable FK reservations
- assigned_to UUID nullable FK users
- task_type varchar(40)
- status varchar(30)
- scheduled_at timestamptz nullable
- started_at timestamptz nullable
- completed_at timestamptz nullable
- verified_by UUID nullable FK users
- verified_at timestamptz nullable
- notes text nullable
- created_at, updated_at

### housekeeping_checklist_items
- id UUID PK
- task_id UUID FK housekeeping_tasks
- item_label varchar(150)
- is_completed boolean
- notes text nullable
- completed_by UUID nullable FK users
- completed_at timestamptz nullable

### maintenance_tickets
- id UUID PK
- ticket_code varchar(40) UNIQUE
- room_id UUID nullable FK rooms
- bed_id UUID nullable FK beds
- category varchar(50)
- priority varchar(20)
- description text
- status varchar(30)
- blocks_inventory boolean DEFAULT false
- reported_by UUID FK users
- assigned_to UUID nullable FK users
- reported_at timestamptz
- resolved_at timestamptz nullable
- closed_at timestamptz nullable
- resolution_notes text nullable

## 8. Roster integration

### roster_assignments
- id UUID PK
- source_system varchar(50)
- external_roster_id varchar(120)
- employee_id UUID FK employees
- duty_date date
- duty_start timestamptz nullable
- duty_end timestamptz nullable
- station_code varchar(50) nullable
- roster_status varchar(30)
- payload_hash varchar(128) nullable
- source_updated_at timestamptz nullable
- synced_at timestamptz
Unique `(source_system, external_roster_id)`.

### accommodation_policies
- id UUID PK
- code varchar(50) UNIQUE
- name varchar(150)
- priority integer
- is_active boolean
- criteria jsonb
- rules jsonb
- approval_mode varchar(30) (AUTO, APPROVAL_REQUIRED, RECOMMENDATION_ONLY)
- effective_from date nullable
- effective_to date nullable
- created_at, updated_at

### accommodation_recommendations
- id UUID PK
- roster_assignment_id UUID FK roster_assignments
- employee_id UUID FK employees
- policy_id UUID FK accommodation_policies
- suggested_check_in date
- suggested_check_out date
- suggested_dormitory_id UUID nullable FK dormitories
- status varchar(30)
- linked_reservation_id UUID nullable FK reservations
- explanation jsonb
- created_at, updated_at

### roster_sync_runs
- id UUID PK
- source_system varchar(50)
- started_at timestamptz
- completed_at timestamptz nullable
- status varchar(30)
- fetched_count integer
- created_count integer
- updated_count integer
- unchanged_count integer
- failed_count integer
- initiated_by UUID nullable FK users
- error_summary text nullable

### integration_exceptions
- id UUID PK
- integration_type varchar(40)
- external_reference varchar(150) nullable
- entity_type varchar(50)
- entity_id UUID nullable
- exception_code varchar(60)
- message text
- status varchar(30)
- resolution_notes text nullable
- resolved_by UUID nullable FK users
- resolved_at timestamptz nullable
- created_at timestamptz

## 9. Notifications, files, audit

### notifications
- id UUID PK
- user_id UUID FK users
- event_code varchar(60)
- title varchar(180)
- body text
- read_at timestamptz nullable
- reference_type varchar(50) nullable
- reference_id UUID nullable
- created_at timestamptz

### notification_templates
- id UUID PK
- event_code varchar(60)
- channel varchar(30)
- subject_template varchar(255) nullable
- body_template text
- is_active boolean
Unique `(event_code, channel)`.

### notification_deliveries
- id UUID PK
- notification_id UUID nullable FK notifications
- channel varchar(30)
- recipient varchar(255)
- status varchar(30)
- provider_message_id varchar(150) nullable
- attempt_count integer
- last_error text nullable
- sent_at timestamptz nullable
- created_at timestamptz

### attachments
- id UUID PK
- object_key varchar(500) UNIQUE
- original_filename varchar(255)
- mime_type varchar(120)
- size_bytes bigint
- checksum varchar(128) nullable
- entity_type varchar(50)
- entity_id UUID
- uploaded_by UUID FK users
- created_at timestamptz

### audit_logs
- id UUID PK
- actor_user_id UUID nullable FK users
- action varchar(80)
- entity_type varchar(80)
- entity_id UUID nullable
- before_data jsonb nullable
- after_data jsonb nullable
- reason text nullable
- request_id varchar(100) nullable
- ip_address inet nullable
- user_agent text nullable
- created_at timestamptz
Audit should be append-only for application roles.

## 10. Important indexes

- `reservations(status, check_in_date, check_out_date)`
- `reservations(primary_employee_id, created_at DESC)`
- `reservations(dormitory_id, check_in_date)`
- `bed_allocations(bed_id, stay_start, stay_end, status)`
- `roster_assignments(employee_id, duty_date)`
- `roster_assignments(source_system, external_roster_id)` unique
- `housekeeping_tasks(status, scheduled_at)`
- `maintenance_tickets(status, priority, reported_at)`
- `audit_logs(entity_type, entity_id, created_at DESC)`
- `notifications(user_id, read_at, created_at DESC)`

## 11. Required database safeguards

- Exclusion constraint or equivalent concurrency-safe protection for overlapping bed allocations.
- FK restrict behavior for historical entities.
- Check constraints for date ranges and positive counts.
- Unique source identity for sync idempotency.
- Transactions for reservation + guest + allocation + event.
- Migration tests against a clean database.
- Seed data must be clearly marked as demo.
