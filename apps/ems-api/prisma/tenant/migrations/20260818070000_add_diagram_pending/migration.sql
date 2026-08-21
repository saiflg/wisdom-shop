-- The lesson text is sent before its picture is drawn, so a turn can exist
-- with a diagram still on the way. Defaults false, which is what every
-- existing turn is: whatever picture it has, it already has.
ALTER TABLE "tutor_turns"
  ADD COLUMN IF NOT EXISTS "diagramPending" BOOLEAN NOT NULL DEFAULT false;
