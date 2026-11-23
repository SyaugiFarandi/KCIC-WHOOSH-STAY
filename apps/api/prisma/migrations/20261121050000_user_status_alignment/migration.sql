-- Align users.status constraint with the shared contract (ACTIVE, SUSPENDED, DISABLED).
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_status_check";
ALTER TABLE "users"
    ADD CONSTRAINT "users_status_check"
    CHECK ("status" IN ('ACTIVE', 'SUSPENDED', 'DISABLED'));
