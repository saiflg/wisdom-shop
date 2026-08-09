-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "customDomain" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "schools_customDomain_key" ON "schools"("customDomain");
