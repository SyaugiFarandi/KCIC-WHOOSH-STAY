-- Additive: Reservation Exception Center queue for 409 conflict cases.
CREATE TABLE "reservation_exceptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "dedupe_key" VARCHAR(200) NOT NULL,
    "exception_type" VARCHAR(40) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'HIGH',
    "status" VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    "dormitory_id" UUID NOT NULL,
    "reservation_id" UUID,
    "room_id" UUID,
    "bed_id" UUID,
    "title" VARCHAR(160) NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" JSONB,
    "occurrence_count" INTEGER NOT NULL DEFAULT 1,
    "assigned_to" UUID,
    "acknowledged_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution_note" TEXT,
    "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reservation_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reservation_exceptions_dedupe_key_key" ON "reservation_exceptions"("dedupe_key");
CREATE INDEX "reservation_exceptions_status_severity_detected_at_idx" ON "reservation_exceptions"("status", "severity", "detected_at" DESC);
CREATE INDEX "reservation_exceptions_dormitory_id_status_idx" ON "reservation_exceptions"("dormitory_id", "status");
CREATE INDEX "reservation_exceptions_reservation_id_idx" ON "reservation_exceptions"("reservation_id");
CREATE INDEX "reservation_exceptions_assigned_to_status_idx" ON "reservation_exceptions"("assigned_to", "status");

ALTER TABLE "reservation_exceptions" ADD CONSTRAINT "reservation_exceptions_dormitory_id_fkey" FOREIGN KEY ("dormitory_id") REFERENCES "dormitories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reservation_exceptions" ADD CONSTRAINT "reservation_exceptions_reservation_id_fkey" FOREIGN KEY ("reservation_id") REFERENCES "reservations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservation_exceptions" ADD CONSTRAINT "reservation_exceptions_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservation_exceptions" ADD CONSTRAINT "reservation_exceptions_bed_id_fkey" FOREIGN KEY ("bed_id") REFERENCES "beds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservation_exceptions" ADD CONSTRAINT "reservation_exceptions_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservation_exceptions" ADD CONSTRAINT "reservation_exceptions_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reservation_exceptions" ADD CONSTRAINT "reservation_exceptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
