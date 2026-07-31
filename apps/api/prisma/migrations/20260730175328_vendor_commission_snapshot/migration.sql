-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "commissionCents" INTEGER,
ADD COLUMN     "commissionPct" DECIMAL(5,2),
ADD COLUMN     "vendorId" TEXT;

-- CreateIndex
CREATE INDEX "order_items_vendorId_idx" ON "order_items"("vendorId");
