-- Additive columns: policy engine reservation context (emergency + priority).
ALTER TABLE "reservations"
  ADD COLUMN "is_emergency" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "emergency_reason" VARCHAR(300),
  ADD COLUMN "priority" VARCHAR(20) NOT NULL DEFAULT 'NORMAL';

CREATE INDEX "reservations_priority_idx" ON "reservations"("priority");
