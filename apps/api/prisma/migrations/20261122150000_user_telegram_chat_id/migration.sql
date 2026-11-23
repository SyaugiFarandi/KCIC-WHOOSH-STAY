-- Additive: per-user Telegram chat binding for notification delivery.
ALTER TABLE "users" ADD COLUMN "telegram_chat_id" VARCHAR(64);
