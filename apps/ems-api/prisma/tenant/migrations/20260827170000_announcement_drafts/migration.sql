-- Drafts: a notice somebody has started and not sent.
--
-- This is what the "Newsletters" menu item was really asking for. A second
-- sender alongside announcements would have been the same list with one extra
-- button; what announcements actually lacked was the ability to write
-- something now and send it later.

-- DEFAULT 'SENT' is doing real work: every row that already exists was sent,
-- months before drafts were a concept. Defaulting to DRAFT would have quietly
-- un-sent the school's entire announcement history.
ALTER TABLE "announcements"
  ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'SENT';

-- A draft has no send date. Nullable rather than defaulting to now, because
-- "written on Monday" and "sent on Monday" are different facts.
ALTER TABLE "announcements" ALTER COLUMN "sentAt" DROP NOT NULL;
ALTER TABLE "announcements" ALTER COLUMN "sentAt" DROP DEFAULT;

-- The two must agree: a sent announcement has a date, a draft does not. This
-- is the pairing that would otherwise drift — a draft carrying a send date
-- reads as sent in every report that looks at the date rather than the status.
ALTER TABLE "announcements"
  ADD CONSTRAINT "announcements_sentAt_matches_status"
  CHECK (
    ("status" = 'SENT' AND "sentAt" IS NOT NULL)
    OR ("status" = 'DRAFT' AND "sentAt" IS NULL)
  );

CREATE INDEX IF NOT EXISTS "announcements_status_idx" ON "announcements" ("status");
