-- Hand-written rather than generated: `prisma migrate dev` refuses to run
-- non-interactively once it wants to warn about a unique constraint, which
-- is the same situation the licenseKey migration hit. Verified beforehand
-- that no duplicate (subscriptionId, periodStart) rows exist.
--
-- This is the double-billing guard. Postgres treats NULLs as distinct in a
-- unique index, so manual invoices (subscriptionId IS NULL) are unaffected
-- and any number can coexist for the same school.
CREATE UNIQUE INDEX "invoices_subscriptionId_periodStart_key"
  ON "invoices" ("subscriptionId", "periodStart");
