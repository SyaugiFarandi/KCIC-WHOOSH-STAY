-- Additive employee organization fields + internal org reference master.
-- All new columns are nullable; existing rows and operational data are untouched.

ALTER TABLE "employees" ADD COLUMN "division_code" VARCHAR(50);
ALTER TABLE "employees" ADD COLUMN "division_name" VARCHAR(150);
ALTER TABLE "employees" ADD COLUMN "join_date" DATE;
ALTER TABLE "employees" ADD COLUMN "supervisor_id" UUID;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_supervisor_id_fkey"
  FOREIGN KEY ("supervisor_id") REFERENCES "employees"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "employees_supervisor_id_idx" ON "employees"("supervisor_id");

CREATE TABLE "org_references" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "type" VARCHAR(30) NOT NULL,
  "code" VARCHAR(50) NOT NULL,
  "name" VARCHAR(150) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'UNCONFIRMED',
  "source_system" VARCHAR(50) NOT NULL DEFAULT 'SYNTHETIC',
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_references_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_references_type_code_key" ON "org_references"("type", "code");
CREATE INDEX "org_references_type_status_idx" ON "org_references"("type", "status");