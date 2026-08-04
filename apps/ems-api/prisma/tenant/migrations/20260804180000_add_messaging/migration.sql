-- CreateEnum
CREATE TYPE "MessageChannel" AS ENUM ('EMAIL', 'SMS', 'WHATSAPP', 'PUSH');

-- CreateEnum
CREATE TYPE "MessageEvent" AS ENUM ('ATTENDANCE_ABSENT', 'FEE_INVOICE_ISSUED', 'FEE_INVOICE_OVERDUE', 'RESULTS_PUBLISHED', 'MANUAL');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterTable: per-family notification opt-out, defaulting to opted in so
-- existing families keep receiving what they receive today.
ALTER TABLE "guardian_links" ADD COLUMN "notifyByEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "guardian_links" ADD COLUMN "notifyBySms" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "message_templates" (
    "id" TEXT NOT NULL,
    "event" "MessageEvent" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "event" "MessageEvent" NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "templateId" TEXT,
    "recipientUserId" TEXT,
    "recipientName" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "studentProfileId" TEXT,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'QUEUED',
    "statusReason" TEXT,
    "providerReference" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- One template per event per channel.
CREATE UNIQUE INDEX "message_templates_event_channel_key" ON "message_templates"("event", "channel");

-- CreateIndex
CREATE INDEX "messages_status_idx" ON "messages"("status");

-- CreateIndex
CREATE INDEX "messages_studentProfileId_idx" ON "messages"("studentProfileId");

-- CreateIndex
CREATE INDEX "messages_event_createdAt_idx" ON "messages"("event", "createdAt");

-- The send-once guarantee. dedupeKey encodes the event and its subject
-- ("this student, this date, absent"), so re-saving a register, re-raising
-- invoices or republishing results cannot notify a family twice. Enforced
-- here rather than in application code, which would race.
CREATE UNIQUE INDEX "messages_dedupeKey_channel_recipientAddress_key" ON "messages"("dedupeKey", "channel", "recipientAddress");

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_studentProfileId_fkey" FOREIGN KEY ("studentProfileId") REFERENCES "student_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
