-- A receipt number on every payment, and a confirmation event to send it with.
--
-- A payment confirmation is the one message a school sends that families keep,
-- so it needs a number they can quote months later when arguing about it.

ALTER TYPE "MessageEvent" ADD VALUE IF NOT EXISTS 'FEE_PAYMENT_RECEIVED';

-- Nullable only because payments recorded before receipts existed have none.
-- Every new one gets a number.
ALTER TABLE "fee_payments" ADD COLUMN "receiptNumber" TEXT;

CREATE UNIQUE INDEX "fee_payments_receiptNumber_key" ON "fee_payments"("receiptNumber");

-- Its own sequence, beside the invoice counter and claimed the same way:
-- inside the transaction that uses it, so two simultaneous payments cannot
-- take the same number. A school reconciling receipts should not have to
-- explain why receipt 5 follows receipt 2.
ALTER TABLE "finance_settings" ADD COLUMN "receiptCounter" INTEGER NOT NULL DEFAULT 0;
