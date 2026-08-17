-- One thing a school told a crowd.
--
-- The individual sends stay in messages, so there is one outbox and one
-- delivery path rather than a parallel system nobody maintains. This table is
-- the announcement itself: what was said, who it was aimed at, who sent it.
--
-- Kept after sending. "Did the school tell us about the closure, and when" is
-- a question schools are asked, and the answer must survive the individual
-- messages being tidied away.
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    -- WHOLE_SCHOOL, ALL_PARENTS, ALL_STAFF or CLASS.
    "audience" TEXT NOT NULL,
    "classId" TEXT,
    "channels" TEXT[],
    -- Stored by value alongside the id so it still reads correctly after that
    -- member of staff leaves.
    "sentByUserId" TEXT,
    "sentByName" TEXT,
    -- Frozen at send time. Recomputing later answers a different question:
    -- the school roll changes, and "who did we tell" must not.
    "reached" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "announcements_sentAt_idx" ON "announcements"("sentAt");

ALTER TABLE "announcements" ADD CONSTRAINT "announcements_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Lets the outbox group four hundred rows under the one thing that caused them.
ALTER TABLE "messages" ADD COLUMN "announcementId" TEXT;

CREATE INDEX "messages_announcementId_idx" ON "messages"("announcementId");

ALTER TABLE "messages" ADD CONSTRAINT "messages_announcementId_fkey"
    FOREIGN KEY ("announcementId") REFERENCES "announcements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
