-- CreateIndex
CREATE INDEX "audit_logs_created_at_id_idx" ON "audit_logs"("created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "notification_deliveries_created_at_id_idx" ON "notification_deliveries"("created_at" DESC, "id");

-- CreateIndex
CREATE INDEX "reservations_requested_at_id_idx" ON "reservations"("requested_at" DESC, "id");

-- CreateIndex
CREATE INDEX "roster_assignments_duty_date_station_code_id_idx" ON "roster_assignments"("duty_date", "station_code", "id");
