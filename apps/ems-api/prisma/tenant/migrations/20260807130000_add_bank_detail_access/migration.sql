-- CreateTable
CREATE TABLE "bank_detail_access" (
    "id" TEXT NOT NULL,
    "staffProfileId" TEXT NOT NULL,
    "staffName" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorName" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_detail_access_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bank_detail_access_staffProfileId_idx" ON "bank_detail_access"("staffProfileId");

-- CreateIndex
CREATE INDEX "bank_detail_access_createdAt_idx" ON "bank_detail_access"("createdAt");

-- No foreign keys on purpose: actor and subject are recorded by value, so
-- deleting either account leaves the audit trail intact.
