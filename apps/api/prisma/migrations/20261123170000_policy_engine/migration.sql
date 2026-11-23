-- Phase C: Accommodation Policy Engine (additive only).
-- Legacy roster-recommendation policies stay untouched: engine_managed defaults to false.

ALTER TABLE "accommodation_policies"
  ADD COLUMN "engine_managed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "description" VARCHAR(1000),
  ADD COLUMN "category" VARCHAR(50),
  ADD COLUMN "effect" VARCHAR(30),
  ADD COLUMN "severity" VARCHAR(20),
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "parameters" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "conditions" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "approved_at" TIMESTAMPTZ(6),
  ADD COLUMN "approved_by_user_id" UUID,
  ADD COLUMN "created_by_user_id" UUID,
  ADD COLUMN "updated_by_user_id" UUID,
  ADD COLUMN "dormitory_id" UUID;

CREATE INDEX "accommodation_policies_engine_managed_status_category_idx"
  ON "accommodation_policies"("engine_managed", "status", "category");

CREATE TABLE "accommodation_policy_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "category" VARCHAR(50) NOT NULL,
  "effect" VARCHAR(30) NOT NULL,
  "severity" VARCHAR(20) NOT NULL,
  "priority" INTEGER NOT NULL,
  "parameters" JSONB NOT NULL,
  "conditions" JSONB NOT NULL,
  "dormitory_id" UUID,
  "effective_from" DATE NOT NULL,
  "effective_to" DATE,
  "approval_mode" VARCHAR(30) NOT NULL,
  "status" VARCHAR(20) NOT NULL,
  "approved_at" TIMESTAMPTZ(6),
  "approved_by_user_id" UUID,
  "created_by_user_id" UUID,
  "change_note" VARCHAR(300),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "accommodation_policy_versions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "accommodation_policy_versions_policy_id_version_key"
  ON "accommodation_policy_versions"("policy_id", "version");

ALTER TABLE "accommodation_policy_versions"
  ADD CONSTRAINT "accommodation_policy_versions_policy_id_fkey"
  FOREIGN KEY ("policy_id") REFERENCES "accommodation_policies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "policy_evaluations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_id" UUID,
  "policy_code" VARCHAR(50) NOT NULL,
  "policy_version" INTEGER NOT NULL,
  "category" VARCHAR(50) NOT NULL,
  "workflow" VARCHAR(30) NOT NULL,
  "result" VARCHAR(30) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "matched" BOOLEAN NOT NULL DEFAULT true,
  "simulated" BOOLEAN NOT NULL DEFAULT false,
  "conditions" JSONB,
  "context" JSONB,
  "subject_type" VARCHAR(30),
  "subject_id" UUID,
  "actor_user_id" UUID,
  "request_id" VARCHAR(64),
  "dormitory_id" UUID,
  "evaluated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "policy_evaluations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "policy_evaluations_policy_id_evaluated_at_idx"
  ON "policy_evaluations"("policy_id", "evaluated_at");
CREATE INDEX "policy_evaluations_workflow_evaluated_at_idx"
  ON "policy_evaluations"("workflow", "evaluated_at");
CREATE INDEX "policy_evaluations_dormitory_id_evaluated_at_idx"
  ON "policy_evaluations"("dormitory_id", "evaluated_at");
CREATE INDEX "policy_evaluations_result_evaluated_at_idx"
  ON "policy_evaluations"("result", "evaluated_at");

ALTER TABLE "policy_evaluations"
  ADD CONSTRAINT "policy_evaluations_policy_id_fkey"
  FOREIGN KEY ("policy_id") REFERENCES "accommodation_policies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
