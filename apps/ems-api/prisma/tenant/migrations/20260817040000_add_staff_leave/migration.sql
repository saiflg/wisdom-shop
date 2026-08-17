-- A member of staff asking for time off, and the school's answer.
--
-- Attached to the user rather than the employment record: a request outlives
-- a change of job title, and whoever decides it is a different user recorded
-- by name.
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    -- ANNUAL, SICK, MATERNITY, PATERNITY, COMPASSIONATE, STUDY, UNPAID.
    -- Only ANNUAL comes out of the allowance.
    "type" TEXT NOT NULL,
    -- Date only, UTC midnight, inclusive at both ends. The cost in working
    -- days is computed and never stored: a stored total would drift the
    -- moment somebody corrected a date.
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    -- REQUESTED, APPROVED, DECLINED or CANCELLED.
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "decidedAt" TIMESTAMP(3),
    "decidedByUserId" TEXT,
    "decidedByName" TEXT,
    "decisionNote" TEXT,
    "requestedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leave_requests_userId_fromDate_idx" ON "leave_requests"("userId", "fromDate");
CREATE INDEX "leave_requests_status_fromDate_idx" ON "leave_requests"("status", "fromDate");

ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Zero means the school is not tracking allowances, not that somebody has no
-- holiday. The balance says so in words.
ALTER TABLE "staff_profiles" ADD COLUMN "leaveEntitlementDays" INTEGER NOT NULL DEFAULT 0;
