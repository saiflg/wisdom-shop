-- Printed on the salary voucher. Free text rather than an enum: the list of
-- qualifications differs by country, and an enum would need a migration every
-- time a school hired somebody with one nobody had anticipated.
ALTER TABLE "staff_profiles" ADD COLUMN "qualification" TEXT;

-- A standing note the bursar writes against a person on the voucher, e.g.
-- "on leave", "half month". On the person rather than one month's payslip.
ALTER TABLE "staff_profiles" ADD COLUMN "remark" TEXT;