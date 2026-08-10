-- Class group chat, and who leads the school.
--
-- One conversation per class, created lazily the first time somebody opens
-- it. Messages are soft-deleted: removing one must not remove it from
-- moderation, because "delete the evidence" is exactly what this has to
-- survive.

CREATE TYPE "SchoolLeadership" AS ENUM ('PRINCIPAL', 'VICE_PRINCIPAL', 'HEAD_TEACHER');

ALTER TABLE "staff_profiles" ADD COLUMN "leadership" "SchoolLeadership";

CREATE TABLE "class_conversations" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3),
    "lockedById" TEXT,
    "lockedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "class_conversations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "class_conversations_classId_key" ON "class_conversations"("classId");

ALTER TABLE "class_conversations"
    ADD CONSTRAINT "class_conversations_classId_fkey"
    FOREIGN KEY ("classId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "class_messages" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,
    "deletedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_messages_pkey" PRIMARY KEY ("id")
);

-- The query this table exists to serve: one conversation, in order.
CREATE INDEX "class_messages_conversationId_createdAt_idx"
    ON "class_messages"("conversationId", "createdAt");

-- Rate limiting asks "what has this person sent here recently".
CREATE INDEX "class_messages_conversationId_authorUserId_createdAt_idx"
    ON "class_messages"("conversationId", "authorUserId", "createdAt");

ALTER TABLE "class_messages"
    ADD CONSTRAINT "class_messages_conversationId_fkey"
    FOREIGN KEY ("conversationId") REFERENCES "class_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "class_messages"
    ADD CONSTRAINT "class_messages_authorUserId_fkey"
    FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "class_message_reports" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "reportedByUserId" TEXT NOT NULL,
    "reportedByName" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "outcome" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_message_reports_pkey" PRIMARY KEY ("id")
);

-- One report per person per message: a second adds nothing, and lets a group
-- bury a teacher in duplicates.
CREATE UNIQUE INDEX "class_message_reports_messageId_reportedByUserId_key"
    ON "class_message_reports"("messageId", "reportedByUserId");

CREATE INDEX "class_message_reports_reviewedAt_idx" ON "class_message_reports"("reviewedAt");

ALTER TABLE "class_message_reports"
    ADD CONSTRAINT "class_message_reports_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "class_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
