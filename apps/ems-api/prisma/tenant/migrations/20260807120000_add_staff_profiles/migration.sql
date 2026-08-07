-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'VOLUNTEER');

-- CreateTable
CREATE TABLE "staff_profiles" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "staffNumber" TEXT,
    "jobTitle" TEXT,
    "employmentType" "EmploymentType",
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "bankName" TEXT,
    "bankCode" TEXT,
    "accountName" TEXT,
    "accountNumberEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- One employment record per login.
CREATE UNIQUE INDEX "staff_profiles_userId_key" ON "staff_profiles"("userId");

-- The natural key for staff import: re-uploading a spreadsheet updates the
-- same person rather than creating a second one. NULLs are distinct, so any
-- number of staff may have no number assigned yet.
CREATE UNIQUE INDEX "staff_profiles_staffNumber_key" ON "staff_profiles"("staffNumber");

-- AddForeignKey
ALTER TABLE "staff_profiles" ADD CONSTRAINT "staff_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
