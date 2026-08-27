-- Money going out: the things fees pay for.

CREATE TYPE "ExpenseStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');

CREATE TABLE IF NOT EXISTS "expenses" (
  "id"                TEXT NOT NULL,
  "category"          TEXT NOT NULL,
  "description"       TEXT NOT NULL,
  "amountCents"       INTEGER NOT NULL,
  "incurredOn"        TIMESTAMP(3) NOT NULL,
  "payee"             TEXT,
  "status"            "ExpenseStatus" NOT NULL DEFAULT 'REQUESTED',
  "method"            TEXT,
  "reference"         TEXT,
  "paidAt"            TIMESTAMP(3),
  "requestedByUserId" TEXT NOT NULL,
  "requestedByName"   TEXT NOT NULL,
  "decidedAt"         TIMESTAMP(3),
  "decidedByUserId"   TEXT,
  "decidedByName"     TEXT,
  "decisionNote"      TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- An expense of zero or less is not spending. A refund is a different thing
-- and belongs somewhere it can be seen as a refund.
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_amount_positive" CHECK ("amountCents" > 0);

-- Money cannot have left on an expense nobody approved. The service refuses
-- it too, but a row is what an auditor reads and this is what makes the row
-- impossible rather than merely unusual.
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_paid_needs_decision"
  CHECK ("status" <> 'PAID' OR ("decidedByUserId" IS NOT NULL AND "paidAt" IS NOT NULL));

-- Whoever asked cannot be whoever decided. The oldest control in bookkeeping,
-- and the one worth having the database hold rather than trusting a service
-- that a future route might bypass.
ALTER TABLE "expenses"
  ADD CONSTRAINT "expenses_decider_is_not_requester"
  CHECK ("decidedByUserId" IS NULL OR "decidedByUserId" <> "requestedByUserId");

CREATE INDEX IF NOT EXISTS "expenses_incurredOn_idx" ON "expenses" ("incurredOn");
CREATE INDEX IF NOT EXISTS "expenses_status_idx" ON "expenses" ("status");
