-- A photograph, voice note or PDF attached to a class message.
--
-- Its own table rather than columns on class_messages: a message with no
-- attachment is the overwhelming majority, and four null columns on every row
-- of the busiest table in the product is the wrong trade.
--
-- The bytes live on disk under a per-school key; only the key is here, and it
-- never appears in a URL. Reading one goes through an authorised route that
-- re-checks the reader against the message, so a withdrawn message cannot
-- leave a fetchable photograph behind.
CREATE TABLE "class_message_attachments" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    -- schools/<schoolId>/attachments/<uuid>.<ext>. The filename is a UUID, so
    -- nothing a child typed is ever part of a path.
    "storageKey" TEXT NOT NULL,
    -- IMAGE, AUDIO or DOCUMENT — decided from the sniffed content type at
    -- upload, never from the name the browser claimed.
    "kind" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    -- Sanitised for display only; never part of a path.
    "displayName" TEXT NOT NULL,
    -- Voice notes only, so a player can show a length before downloading.
    "durationSeconds" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "class_message_attachments_messageId_idx" ON "class_message_attachments"("messageId");

ALTER TABLE "class_message_attachments" ADD CONSTRAINT "class_message_attachments_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "class_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
