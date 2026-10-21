-- Additive presentation preferences. Existing account/device content and schedules are preserved.
ALTER TABLE "User" ADD COLUMN "emailLanguage" TEXT NOT NULL DEFAULT 'en-US';
ALTER TABLE "PushSubscription" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'en-US';
