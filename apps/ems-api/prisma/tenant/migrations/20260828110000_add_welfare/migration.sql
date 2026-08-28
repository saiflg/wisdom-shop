-- Staff welfare: somebody asking the school for help. Medical assistance is a
-- kind here rather than its own table — singling it out would be its own
-- disclosure, because everybody would learn what the hidden category was.

CREATE TYPE "WelfareKind" AS ENUM ('MEDICAL', 'HARDSHIP', 'BEREAVEMENT', 'LOAN', 'OTHER');
CREATE TYPE "WelfareStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'DECLINED');

CREATE TABLE IF NOT EXISTS "welfare_requests" (
  "id"              TEXT NOT NULL,
  "userId"          TEXT NOT NULL,
  "kind"            "WelfareKind" NOT NULL,
  "reason"          TEXT NOT NULL,
  "amountCents"     INTEGER NOT NULL,
  "status"          "WelfareStatus" NOT NULL DEFAULT 'REQUESTED',
  "decidedAt"       TIMESTAMP(3),
  "decidedByUserId" TEXT,
  "decidedByName"   TEXT,
  "decisionNote"    TEXT,
  "paidAt"          TIMESTAMP(3),
  "reference"       TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "welfare_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "welfare_requests"
  ADD CONSTRAINT "welfare_requests_amount_positive" CHECK ("amountCents" > 0);

-- Nobody decides their own welfare. The service refuses it; this makes the
-- row impossible. It matters more here than on an expense, not less — the
-- person deciding must not be the person who benefits.
ALTER TABLE "welfare_requests"
  ADD CONSTRAINT "welfare_requests_decider_is_not_requester"
  CHECK ("decidedByUserId" IS NULL OR "decidedByUserId" <> "userId");

-- Money cannot have left on a request nobody approved.
ALTER TABLE "welfare_requests"
  ADD CONSTRAINT "welfare_requests_paid_needs_decision"
  CHECK ("status" <> 'PAID' OR ("decidedByUserId" IS NOT NULL AND "paidAt" IS NOT NULL));

CREATE INDEX IF NOT EXISTS "welfare_requests_userId_idx" ON "welfare_requests" ("userId");
CREATE INDEX IF NOT EXISTS "welfare_requests_status_idx" ON "welfare_requests" ("status");

ALTER TABLE "welfare_requests"
  ADD CONSTRAINT "welfare_requests_userId_fkey" FOREIGN KEY ("userId")
  REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
