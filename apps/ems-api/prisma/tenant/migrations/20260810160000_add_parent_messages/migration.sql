-- A conversation between a family and the school, about one child.
--
-- Keyed on the child rather than on a (parent, teacher) pair: teachers
-- change, both parents belong in the same thread, and a private channel
-- between one adult and one child's parent is the arrangement safeguarding
-- policy exists to prevent.

CREATE TABLE "parent_threads" (
    "id" TEXT NOT NULL,
    "studentProfileId" TEXT NOT NULL,
    -- Denormalised so an inbox can be sorted without reading every message.
    "lastMessageAt" TIMESTAMP(3),
    "lastSide" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parent_threads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "parent_threads_studentProfileId_key" ON "parent_threads"("studentProfileId");
CREATE INDEX "parent_threads_lastMessageAt_idx" ON "parent_threads"("lastMessageAt");

ALTER TABLE "parent_threads"
    ADD CONSTRAINT "parent_threads_studentProfileId_fkey"
    FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "parent_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    -- Snapshotted: a thread must still read correctly after the teacher has
    -- left and the guardian link has been removed.
    "authorName" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    -- Withdrawn, not erased: the other person saw it.
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parent_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "parent_messages_threadId_createdAt_idx" ON "parent_messages"("threadId", "createdAt");

ALTER TABLE "parent_messages"
    ADD CONSTRAINT "parent_messages_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "parent_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parent_messages"
    ADD CONSTRAINT "parent_messages_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
