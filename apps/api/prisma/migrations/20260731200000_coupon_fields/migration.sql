-- Coupon support: the minimum-spend rule, and the discount snapshot on the
-- order.
--
-- discountCents is stored rather than recomputed from the coupon, because a
-- coupon can later be edited or deactivated and the order must always show
-- what was actually charged.

ALTER TABLE "coupons" ADD COLUMN "minSubtotalCents" INTEGER;
ALTER TABLE "orders" ADD COLUMN "discountCents" INTEGER NOT NULL DEFAULT 0;
