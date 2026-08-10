-- A photograph for any person in the school.
--
-- On users rather than on student_profiles and staff_profiles separately: a
-- photograph is a fact about a person, and every one of them is a user.
-- Nullable because it is never compulsory.
ALTER TABLE "users" ADD COLUMN "photoKey" TEXT;
