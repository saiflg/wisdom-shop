-- Narrows the double-billing guard to automated renewals only.
--
-- The previous migration added a plain unique index on
-- (subscriptionId, periodStart). That also stopped an operator raising a
-- second legitimate ad-hoc invoice inside the same period — caught by the
-- full e2e run, not by review.
--
-- A partial index is the right shape: the automated cycle may write at
-- most one invoice per subscription period, while manual invoices are
-- unconstrained. Prisma's schema DSL cannot express `WHERE`, so this index
-- is defined here only; Prisma still reports its violation as P2002.

CREATE TYPE "InvoiceOrigin" AS ENUM ('CYCLE', 'MANUAL');

ALTER TABLE "invoices"
  ADD COLUMN "origin" "InvoiceOrigin" NOT NULL DEFAULT 'MANUAL';

DROP INDEX IF EXISTS "invoices_subscriptionId_periodStart_key";

CREATE UNIQUE INDEX "invoices_cycle_unique_per_period"
  ON "invoices" ("subscriptionId", "periodStart")
  WHERE "origin" = 'CYCLE';
