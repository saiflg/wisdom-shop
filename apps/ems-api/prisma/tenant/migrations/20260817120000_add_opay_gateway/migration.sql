-- OPay as a fee gateway.
--
-- Two columns rather than one: OPay identifies the merchant in a header
-- (MerchantId) as well as authenticating with a key, and it publishes
-- separate sandbox and live hosts. Both are null/false for every other
-- provider, so nothing existing changes.

ALTER TYPE "PaymentProvider" ADD VALUE IF NOT EXISTS 'OPAY';

ALTER TABLE "payment_gateway_settings"
  ADD COLUMN IF NOT EXISTS "merchantId" TEXT,
  ADD COLUMN IF NOT EXISTS "sandbox" BOOLEAN NOT NULL DEFAULT false;
