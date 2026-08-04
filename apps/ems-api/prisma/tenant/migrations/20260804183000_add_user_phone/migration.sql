-- A phone number for SMS notifications.
--
-- Its own migration rather than folded into 20260804180000_add_messaging:
-- that one had already been applied, and Prisma checksums applied
-- migrations, so editing it in place would leave every database that ran
-- the original permanently out of step with the file.
--
-- Nullable and deliberately not unique — two parents legitimately share a
-- number, and a household landline is one address for a whole family.
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
