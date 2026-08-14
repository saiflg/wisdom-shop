-- Which part of the school this person belongs to: "Primary", "Secondary",
-- "Islamiyyah", "Security", "Kitchen".
--
-- Free text and distinct from jobTitle. A school has Primary teachers and
-- Secondary teachers holding the same job title, and staff turnover is read by
-- section because that is where a gap has to be filled. An enum would need a
-- migration every time a school opened a new wing.
ALTER TABLE "staff_profiles" ADD COLUMN "section" TEXT;
