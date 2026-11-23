-- Development-only credential verification for demo accounts.
-- Production runs with AUTH_MODE=oidc and SEED_DEMO=false, so these hashes are never created there.
ALTER TABLE "users" ADD COLUMN "demo_password_hash" VARCHAR(255);
