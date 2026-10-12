-- Existing shares remain owner-managed. New grants retain the person who invited them.
ALTER TABLE "ReminderShare" ADD COLUMN "invitedById" TEXT;
ALTER TABLE "ReminderInvitation" ADD COLUMN "invitedById" TEXT;
CREATE INDEX "ReminderShare_invitedById_idx" ON "ReminderShare"("invitedById");
CREATE INDEX "ReminderInvitation_invitedById_idx" ON "ReminderInvitation"("invitedById");
ALTER TABLE "ReminderShare" ADD CONSTRAINT "ReminderShare_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReminderInvitation" ADD CONSTRAINT "ReminderInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReminderShare" ADD COLUMN "shadeProminence" "ShadeProminence" NOT NULL DEFAULT 'INHERIT';
-- Preserve existing display choices at migration, then let each participant change their own.
UPDATE "ReminderShare" AS share SET "shadeProminence" = reminder."shadeProminence"
FROM "Reminder" AS reminder WHERE reminder."id" = share."reminderId";
