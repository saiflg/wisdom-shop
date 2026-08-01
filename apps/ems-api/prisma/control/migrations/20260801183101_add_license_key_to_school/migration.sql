-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "licenseKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "schools_licenseKey_key" ON "schools"("licenseKey");
