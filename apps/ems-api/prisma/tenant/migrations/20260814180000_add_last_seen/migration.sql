-- When this person was last active, for the "online now" dot in a class chat.
--
-- Deliberately coarse: written when somebody opens a conversation, not on
-- every request. The question a child is asking is "is anybody there", and
-- answering it to the minute is enough. A precise activity log of children
-- would be surveillance; this is a presence indicator.
ALTER TABLE "users" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
