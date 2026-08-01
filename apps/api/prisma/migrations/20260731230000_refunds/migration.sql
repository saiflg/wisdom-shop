-- Refunds: money leaving the merchant account, tracked as a ledger.

-- A partially refunded order is neither fully refunded nor untouched.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_REFUNDED' BEFORE 'REFUNDED';

CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "reason" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "providerRef" TEXT,
    "failureReason" TEXT,
    "initiatedById" TEXT,
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- The actual double-refund guard. Application checks race; this does not.
CREATE UNIQUE INDEX "refunds_orderId_idempotencyKey_key" ON "refunds"("orderId", "idempotencyKey");
CREATE INDEX "refunds_orderId_idx" ON "refunds"("orderId");
CREATE INDEX "refunds_provider_providerRef_idx" ON "refunds"("provider", "providerRef");

ALTER TABLE "refunds" ADD CONSTRAINT "refunds_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey"
    FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_initiatedById_fkey"
    FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
