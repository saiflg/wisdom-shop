-- Money taken off a family's bill, and the standing awards that produce it.
--
-- `totalCents` stays what it has always been: the amount PAYABLE. A discount
-- lowers it and records how much was taken off, so the gross is always
-- recoverable and every existing payment rule keeps working untouched.
ALTER TABLE "fee_invoices" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;

-- A standing entitlement, attached to a student rather than an invoice: a
-- scholarship is a decision about a child, and it has to keep applying to
-- bills that do not exist yet.
CREATE TABLE "scholarships" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sponsor" TEXT,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    -- Inclusive at both ends. No end date means it runs until withdrawn.
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    -- ACTIVE or WITHDRAWN. Withdrawn rather than deleted: the discounts it
    -- already produced stay on the invoices they were granted against.
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "awardedByUserId" TEXT,
    "awardedByName" TEXT,
    "withdrawnReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "scholarships_studentProfileId_idx" ON "scholarships"("studentProfileId");

-- Its own rows rather than a column on the invoice, because a family asking
-- "why is this less than my neighbour's" deserves the list, and withdrawing
-- one award must not disturb another.
CREATE TABLE "fee_discounts" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    -- PERCENT or FIXED: how it was expressed when granted, kept so "20% off"
    -- still reads as a percentage next year.
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    -- What it actually came to after capping. This is the number the
    -- arithmetic uses; "value" is how it was described.
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT,
    "scholarshipId" TEXT,
    "grantedByUserId" TEXT,
    "grantedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fee_discounts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fee_discounts_invoiceId_idx" ON "fee_discounts"("invoiceId");
CREATE INDEX "fee_discounts_scholarshipId_idx" ON "fee_discounts"("scholarshipId");

ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_studentProfileId_fkey"
    FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "fee_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL rather than CASCADE: withdrawing an award must not erase the
-- discounts it already granted, which a school still has to explain.
ALTER TABLE "fee_discounts" ADD CONSTRAINT "fee_discounts_scholarshipId_fkey"
    FOREIGN KEY ("scholarshipId") REFERENCES "scholarships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
