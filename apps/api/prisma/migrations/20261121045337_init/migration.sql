-- Required for the bed allocation exclusion constraint (D-007).
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "oidc_issuer" VARCHAR(255),
    "oidc_subject" VARCHAR(255),
    "employee_id" UUID,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(150) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(100) NOT NULL,
    "module" VARCHAR(50) NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "scope_type" VARCHAR(30) NOT NULL,
    "scope_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_system" VARCHAR(50) NOT NULL,
    "external_employee_id" VARCHAR(100) NOT NULL,
    "employee_code" VARCHAR(50) NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "work_email" VARCHAR(255),
    "department_code" VARCHAR(50),
    "department_name" VARCHAR(150),
    "position_code" VARCHAR(50),
    "position_name" VARCHAR(150),
    "home_station_code" VARCHAR(50),
    "employment_status" VARCHAR(30) NOT NULL,
    "eligibility_status" VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN',
    "source_updated_at" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_system" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "status" VARCHAR(30) NOT NULL,
    "fetched_count" INTEGER NOT NULL DEFAULT 0,
    "inserted_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "initiated_by" UUID,

    CONSTRAINT "employee_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dormitories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "station_code" VARCHAR(50),
    "contact_name" VARCHAR(150),
    "contact_phone" VARCHAR(40),
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,

    CONSTRAINT "dormitories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dormitory_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "floors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "building_id" UUID NOT NULL,
    "floor_number" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "floors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "default_capacity" INTEGER NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "floor_id" UUID NOT NULL,
    "room_type_id" UUID NOT NULL,
    "room_number" VARCHAR(40) NOT NULL,
    "name" VARCHAR(100),
    "description" TEXT,
    "gender_policy" VARCHAR(30) NOT NULL DEFAULT 'UNSPECIFIED',
    "operational_status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "housekeeping_status" VARCHAR(30) NOT NULL DEFAULT 'READY',
    "status_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "beds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "bed_code" VARCHAR(40) NOT NULL,
    "label" VARCHAR(80),
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "housekeeping_status" VARCHAR(30) NOT NULL DEFAULT 'READY',
    "status_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_facilities" (
    "room_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "quantity" INTEGER,
    "notes" TEXT,

    CONSTRAINT "room_facilities_pkey" PRIMARY KEY ("room_id","facility_id")
);

-- CreateTable
CREATE TABLE "inventory_blocks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID,
    "bed_id" UUID,
    "start_at" TIMESTAMPTZ(6) NOT NULL,
    "end_at" TIMESTAMPTZ(6) NOT NULL,
    "block_type" VARCHAR(30) NOT NULL,
    "reason" TEXT NOT NULL,
    "source_ticket_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_blocks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booking_code" VARCHAR(40) NOT NULL,
    "primary_employee_id" UUID NOT NULL,
    "dormitory_id" UUID NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "source_reference" VARCHAR(150),
    "idempotency_key" VARCHAR(150),
    "check_in_date" DATE NOT NULL,
    "check_out_date" DATE NOT NULL,
    "occupant_count" INTEGER NOT NULL,
    "purpose" TEXT,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "approval_status" VARCHAR(30) NOT NULL DEFAULT 'NOT_REQUIRED',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancellation_reason" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_guests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "guest_role" VARCHAR(30) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_guests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bed_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "reservation_guest_id" UUID NOT NULL,
    "bed_id" UUID NOT NULL,
    "stay_start" DATE NOT NULL,
    "stay_end" DATE NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'HELD',
    "allocated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_at" TIMESTAMPTZ(6),
    "allocated_by" UUID,

    CONSTRAINT "bed_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "event_type" VARCHAR(50) NOT NULL,
    "from_status" VARCHAR(30),
    "to_status" VARCHAR(30),
    "reason" TEXT,
    "actor_user_id" UUID,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reservation_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "step_number" INTEGER NOT NULL,
    "approver_role_code" VARCHAR(50) NOT NULL,
    "approver_user_id" UUID,
    "status" VARCHAR(30) NOT NULL,
    "decision_at" TIMESTAMPTZ(6),
    "comments" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkin_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "checked_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by" UUID NOT NULL,
    "verification_method" VARCHAR(30) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "checkin_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkout_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "checked_out_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by" UUID NOT NULL,
    "room_condition" VARCHAR(30) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "checkout_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "qr_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "reservation_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "qr_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "room_id" UUID NOT NULL,
    "bed_id" UUID,
    "reservation_id" UUID,
    "assigned_to" UUID,
    "task_type" VARCHAR(40) NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "verified_by" UUID,
    "verified_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "housekeeping_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "housekeeping_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "task_id" UUID NOT NULL,
    "item_label" VARCHAR(150) NOT NULL,
    "is_completed" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "completed_by" UUID,
    "completed_at" TIMESTAMPTZ(6),

    CONSTRAINT "housekeeping_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maintenance_tickets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "ticket_code" VARCHAR(40) NOT NULL,
    "room_id" UUID,
    "bed_id" UUID,
    "category" VARCHAR(50) NOT NULL,
    "priority" VARCHAR(20) NOT NULL,
    "description" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "blocks_inventory" BOOLEAN NOT NULL DEFAULT false,
    "reported_by" UUID NOT NULL,
    "assigned_to" UUID,
    "reported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "resolution_notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_system" VARCHAR(50) NOT NULL,
    "external_roster_id" VARCHAR(120) NOT NULL,
    "employee_id" UUID NOT NULL,
    "duty_date" DATE NOT NULL,
    "duty_start" TIMESTAMPTZ(6),
    "duty_end" TIMESTAMPTZ(6),
    "station_code" VARCHAR(50),
    "roster_status" VARCHAR(30) NOT NULL,
    "payload_hash" VARCHAR(128),
    "source_updated_at" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roster_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_policies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "criteria" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "approval_mode" VARCHAR(30) NOT NULL,
    "effective_from" DATE,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accommodation_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "roster_assignment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "policy_id" UUID NOT NULL,
    "suggested_check_in" DATE NOT NULL,
    "suggested_check_out" DATE NOT NULL,
    "suggested_dormitory_id" UUID,
    "status" VARCHAR(30) NOT NULL DEFAULT 'RECOMMENDED',
    "linked_reservation_id" UUID,
    "explanation" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accommodation_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roster_sync_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_system" VARCHAR(50) NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "status" VARCHAR(30) NOT NULL,
    "fetched_count" INTEGER NOT NULL DEFAULT 0,
    "created_count" INTEGER NOT NULL DEFAULT 0,
    "updated_count" INTEGER NOT NULL DEFAULT 0,
    "unchanged_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "initiated_by" UUID,
    "error_summary" TEXT,

    CONSTRAINT "roster_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "integration_type" VARCHAR(40) NOT NULL,
    "external_reference" VARCHAR(150),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID,
    "exception_code" VARCHAR(60) NOT NULL,
    "message" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
    "resolution_notes" TEXT,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "integration_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "event_code" VARCHAR(60) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(6),
    "reference_type" VARCHAR(50),
    "reference_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "event_code" VARCHAR(60) NOT NULL,
    "channel" VARCHAR(30) NOT NULL,
    "subject_template" VARCHAR(255),
    "body_template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID,
    "channel" VARCHAR(30) NOT NULL,
    "recipient" VARCHAR(255) NOT NULL,
    "status" VARCHAR(30) NOT NULL,
    "provider_message_id" VARCHAR(150),
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "object_key" VARCHAR(500) NOT NULL,
    "original_filename" VARCHAR(255) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" VARCHAR(128),
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(80) NOT NULL,
    "entity_id" UUID,
    "before_data" JSONB,
    "after_data" JSONB,
    "reason" TEXT,
    "request_id" VARCHAR(100),
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_employee_id_idx" ON "users"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_oidc_issuer_oidc_subject_key" ON "users"("oidc_issuer", "oidc_subject");

-- CreateIndex
CREATE UNIQUE INDEX "roles_code_key" ON "roles"("code");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "employees_employee_code_idx" ON "employees"("employee_code");

-- CreateIndex
CREATE INDEX "employees_full_name_idx" ON "employees"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_source_system_external_employee_id_key" ON "employees"("source_system", "external_employee_id");

-- CreateIndex
CREATE INDEX "employee_sync_logs_source_system_started_at_idx" ON "employee_sync_logs"("source_system", "started_at");

-- CreateIndex
CREATE UNIQUE INDEX "dormitories_code_key" ON "dormitories"("code");

-- CreateIndex
CREATE INDEX "dormitories_station_code_status_idx" ON "dormitories"("station_code", "status");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_dormitory_id_code_key" ON "buildings"("dormitory_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "floors_building_id_floor_number_key" ON "floors"("building_id", "floor_number");

-- CreateIndex
CREATE UNIQUE INDEX "room_types_code_key" ON "room_types"("code");

-- CreateIndex
CREATE INDEX "rooms_room_type_id_idx" ON "rooms"("room_type_id");

-- CreateIndex
CREATE INDEX "rooms_operational_status_housekeeping_status_idx" ON "rooms"("operational_status", "housekeeping_status");

-- CreateIndex
CREATE UNIQUE INDEX "rooms_floor_id_room_number_key" ON "rooms"("floor_id", "room_number");

-- CreateIndex
CREATE INDEX "beds_status_housekeeping_status_idx" ON "beds"("status", "housekeeping_status");

-- CreateIndex
CREATE UNIQUE INDEX "beds_room_id_bed_code_key" ON "beds"("room_id", "bed_code");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_code_key" ON "facilities"("code");

-- CreateIndex
CREATE INDEX "inventory_blocks_room_id_start_at_end_at_idx" ON "inventory_blocks"("room_id", "start_at", "end_at");

-- CreateIndex
CREATE INDEX "inventory_blocks_bed_id_start_at_end_at_idx" ON "inventory_blocks"("bed_id", "start_at", "end_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservations_booking_code_key" ON "reservations"("booking_code");

-- CreateIndex
CREATE INDEX "reservations_status_check_in_date_check_out_date_idx" ON "reservations"("status", "check_in_date", "check_out_date");

-- CreateIndex
CREATE INDEX "reservations_primary_employee_id_created_at_idx" ON "reservations"("primary_employee_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "reservations_dormitory_id_check_in_date_idx" ON "reservations"("dormitory_id", "check_in_date");

-- CreateIndex
CREATE INDEX "reservation_guests_employee_id_idx" ON "reservation_guests"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_guests_reservation_id_employee_id_key" ON "reservation_guests"("reservation_id", "employee_id");

-- CreateIndex
CREATE INDEX "bed_allocations_bed_id_stay_start_stay_end_status_idx" ON "bed_allocations"("bed_id", "stay_start", "stay_end", "status");

-- CreateIndex
CREATE INDEX "bed_allocations_reservation_id_idx" ON "bed_allocations"("reservation_id");

-- CreateIndex
CREATE INDEX "reservation_events_reservation_id_created_at_idx" ON "reservation_events"("reservation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reservation_approvals_reservation_id_step_number_key" ON "reservation_approvals"("reservation_id", "step_number");

-- CreateIndex
CREATE UNIQUE INDEX "checkin_records_reservation_id_employee_id_key" ON "checkin_records"("reservation_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_records_reservation_id_employee_id_key" ON "checkout_records"("reservation_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "qr_tokens_token_hash_key" ON "qr_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "qr_tokens_reservation_id_employee_id_consumed_at_idx" ON "qr_tokens"("reservation_id", "employee_id", "consumed_at");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_status_scheduled_at_idx" ON "housekeeping_tasks"("status", "scheduled_at");

-- CreateIndex
CREATE INDEX "housekeeping_tasks_room_id_status_idx" ON "housekeeping_tasks"("room_id", "status");

-- CreateIndex
CREATE INDEX "housekeeping_checklist_items_task_id_idx" ON "housekeeping_checklist_items"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "maintenance_tickets_ticket_code_key" ON "maintenance_tickets"("ticket_code");

-- CreateIndex
CREATE INDEX "maintenance_tickets_status_priority_reported_at_idx" ON "maintenance_tickets"("status", "priority", "reported_at");

-- CreateIndex
CREATE INDEX "roster_assignments_employee_id_duty_date_idx" ON "roster_assignments"("employee_id", "duty_date");

-- CreateIndex
CREATE UNIQUE INDEX "roster_assignments_source_system_external_roster_id_key" ON "roster_assignments"("source_system", "external_roster_id");

-- CreateIndex
CREATE UNIQUE INDEX "accommodation_policies_code_key" ON "accommodation_policies"("code");

-- CreateIndex
CREATE INDEX "accommodation_recommendations_employee_id_status_idx" ON "accommodation_recommendations"("employee_id", "status");

-- CreateIndex
CREATE INDEX "roster_sync_runs_source_system_started_at_idx" ON "roster_sync_runs"("source_system", "started_at");

-- CreateIndex
CREATE INDEX "integration_exceptions_status_integration_type_created_at_idx" ON "integration_exceptions"("status", "integration_type", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_event_code_channel_key" ON "notification_templates"("event_code", "channel");

-- CreateIndex
CREATE INDEX "notification_deliveries_status_attempt_count_idx" ON "notification_deliveries"("status", "attempt_count");

-- CreateIndex
CREATE UNIQUE INDEX "attachments_object_key_key" ON "attachments"("object_key");

-- CreateIndex
CREATE INDEX "attachments_entity_type_entity_id_idx" ON "attachments"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_created_at_idx" ON "audit_logs"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_sync_logs" ADD CONSTRAINT "employee_sync_logs_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_dormitory_id_fkey" FOREIGN KEY ("dormitory_id") REFERENCES "dormitories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "floors" ADD CONSTRAINT "floors_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_floor_id_fkey" FOREIGN KEY ("floor_id") REFERENCES "floors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_room_type_id_fkey" FOREIGN KEY ("room_type_id") REFERENCES "room_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "beds" ADD CONSTRAINT "beds_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_facilities" ADD CONSTRAINT "room_facilities_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_facilities" ADD CONSTRAINT "room_facilities_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_source_ticket_id_fkey" FOREIGN KEY ("source_ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_blocks" ADD CONSTRAINT "inventory_blocks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_primary_employee_id_fkey" FOREIGN KEY ("primary_employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_dormitory_id_fkey" FOREIGN KEY ("dormitory_id") REFERENCES "dormitories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_guests" ADD CONSTRAINT "reservation_guests_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_allocations" ADD CONSTRAINT "bed_allocations_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_allocations" ADD CONSTRAINT "bed_allocations_reservation_guest_id_fkey" FOREIGN KEY ("reservation_guest_id") REFERENCES "reservation_guests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_allocations" ADD CONSTRAINT "bed_allocations_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bed_allocations" ADD CONSTRAINT "bed_allocations_allocated_by_fkey" FOREIGN KEY ("allocated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_events" ADD CONSTRAINT "reservation_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_approvals" ADD CONSTRAINT "reservation_approvals_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_approvals" ADD CONSTRAINT "reservation_approvals_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkin_records" ADD CONSTRAINT "checkin_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_records" ADD CONSTRAINT "checkout_records_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_records" ADD CONSTRAINT "checkout_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkout_records" ADD CONSTRAINT "checkout_records_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "qr_tokens" ADD CONSTRAINT "qr_tokens_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_tasks" ADD CONSTRAINT "housekeeping_tasks_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_checklist_items" ADD CONSTRAINT "housekeeping_checklist_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "housekeeping_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "housekeeping_checklist_items" ADD CONSTRAINT "housekeeping_checklist_items_completed_by_fkey" FOREIGN KEY ("completed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_assignments" ADD CONSTRAINT "roster_assignments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_recommendations" ADD CONSTRAINT "accommodation_recommendations_roster_assignment_id_fkey" FOREIGN KEY ("roster_assignment_id") REFERENCES "roster_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_recommendations" ADD CONSTRAINT "accommodation_recommendations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_recommendations" ADD CONSTRAINT "accommodation_recommendations_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "accommodation_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accommodation_recommendations" ADD CONSTRAINT "accommodation_recommendations_linked_reservation_id_fkey" FOREIGN KEY ("linked_reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roster_sync_runs" ADD CONSTRAINT "roster_sync_runs_initiated_by_fkey" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_exceptions" ADD CONSTRAINT "integration_exceptions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Domain constraints (D-006, D-007, D-009)
-- ---------------------------------------------------------------------------

ALTER TABLE "user_roles"
    ADD CONSTRAINT "user_roles_scope_type_check"
    CHECK ("scope_type" IN ('GLOBAL', 'DORMITORY', 'BUILDING', 'ASSIGNED_TASK', 'SELF')),
    ADD CONSTRAINT "user_roles_scope_id_check"
    CHECK (
        ("scope_type" = 'GLOBAL' AND "scope_id" IS NULL)
        OR ("scope_type" IN ('DORMITORY', 'BUILDING') AND "scope_id" IS NOT NULL)
        OR ("scope_type" IN ('ASSIGNED_TASK', 'SELF'))
    );

CREATE UNIQUE INDEX "user_roles_unique_assignment"
    ON "user_roles" (user_id, role_id, scope_type, COALESCE(scope_id, '00000000-0000-0000-0000-000000000000'::uuid));

ALTER TABLE "users"
    ADD CONSTRAINT "users_status_check"
    CHECK ("status" IN ('ACTIVE', 'INACTIVE', 'SUSPENDED'));

ALTER TABLE "system_settings"
    ADD CONSTRAINT "system_settings_key_check"
    CHECK (length(trim("key")) > 0);

ALTER TABLE "reservations"
    ADD CONSTRAINT "reservations_dates_check"
    CHECK ("check_out_date" > "check_in_date"),
    ADD CONSTRAINT "reservations_occupant_count_check"
    CHECK ("occupant_count" > 0),
    ADD CONSTRAINT "reservations_source_check"
    CHECK ("source" IN ('CREW', 'MANAGEMENT', 'ROSTER')),
    ADD CONSTRAINT "reservations_status_check"
    CHECK ("status" IN (
        'DRAFT', 'PENDING_APPROVAL', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT',
        'CANCELLED', 'REJECTED', 'NO_SHOW', 'EXCEPTION'
    )),
    ADD CONSTRAINT "reservations_approval_status_check"
    CHECK ("approval_status" IN ('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'));

CREATE UNIQUE INDEX "reservations_idempotency_unique"
    ON "reservations" ("source", "idempotency_key")
    WHERE "idempotency_key" IS NOT NULL;

ALTER TABLE "bed_allocations"
    ADD CONSTRAINT "bed_allocations_dates_check"
    CHECK ("stay_end" > "stay_start"),
    ADD CONSTRAINT "bed_allocations_status_check"
    CHECK ("status" IN ('HELD', 'ACTIVE', 'RELEASED', 'CANCELLED')),
    ADD CONSTRAINT "bed_allocations_released_check"
    CHECK (("status" IN ('RELEASED', 'CANCELLED')) = ("released_at" IS NOT NULL));

-- Authoritative protection against double allocation for overlapping stays.
-- Check-in inclusive, check-out exclusive.
ALTER TABLE "bed_allocations"
    ADD CONSTRAINT "bed_allocations_no_overlap"
    EXCLUDE USING gist (
        "bed_id" WITH =,
        daterange("stay_start", "stay_end", '[)') WITH &&
    )
    WHERE ("status" IN ('HELD', 'ACTIVE'));

ALTER TABLE "inventory_blocks"
    ADD CONSTRAINT "inventory_blocks_dates_check"
    CHECK ("end_at" > "start_at"),
    ADD CONSTRAINT "inventory_blocks_target_check"
    CHECK (("room_id" IS NOT NULL) <> ("bed_id" IS NOT NULL));

ALTER TABLE "qr_tokens"
    ADD CONSTRAINT "qr_tokens_expiry_check"
    CHECK ("expires_at" > "created_at");

CREATE UNIQUE INDEX "qr_tokens_one_active_per_occupant"
    ON "qr_tokens" ("reservation_id", "employee_id")
    WHERE "consumed_at" IS NULL;

ALTER TABLE "maintenance_tickets"
    ADD CONSTRAINT "maintenance_tickets_block_target_check"
    CHECK (NOT "blocks_inventory" OR "room_id" IS NOT NULL OR "bed_id" IS NOT NULL),
    ADD CONSTRAINT "maintenance_tickets_priority_check"
    CHECK ("priority" IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'));

ALTER TABLE "attachments"
    ADD CONSTRAINT "attachments_size_check"
    CHECK ("size_bytes" > 0);

ALTER TABLE "employee_sync_logs"
    ADD CONSTRAINT "employee_sync_logs_status_check"
    CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'));

ALTER TABLE "roster_sync_runs"
    ADD CONSTRAINT "roster_sync_runs_status_check"
    CHECK ("status" IN ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED'));

ALTER TABLE "integration_exceptions"
    ADD CONSTRAINT "integration_exceptions_status_check"
    CHECK ("status" IN ('OPEN', 'RESOLVED', 'IGNORED'));

ALTER TABLE "notification_templates"
    ADD CONSTRAINT "notification_templates_channel_check"
    CHECK ("channel" IN ('IN_APP', 'EMAIL', 'TELEGRAM'));

-- Audit logs are append-only.
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is append-only (attempted % on id %)', TG_OP, OLD.id
        USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_immutable
    BEFORE UPDATE OR DELETE ON "audit_logs"
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();

