-- Boarding houses, rooms, and who sleeps in them.

CREATE TABLE IF NOT EXISTS "hostel_blocks" (
  "id"         TEXT NOT NULL,
  "name"       TEXT NOT NULL,
  "wardenName" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  "deletedAt"  TIMESTAMP(3),
  CONSTRAINT "hostel_blocks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "hostel_rooms" (
  "id"        TEXT NOT NULL,
  "blockId"   TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "beds"      INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "hostel_rooms_pkey" PRIMARY KEY ("id")
);

-- A negative bed count would make every capacity check pass by accident.
-- Note there is deliberately NO constraint stopping a room holding more
-- children than beds: a school reducing a room from six beds to four while
-- six children are in it is a real situation, and refusing the edit would
-- leave them unable to record what is actually true. It is reported instead.
ALTER TABLE "hostel_rooms"
  ADD CONSTRAINT "hostel_rooms_beds_not_negative" CHECK ("beds" >= 0);

CREATE INDEX IF NOT EXISTS "hostel_rooms_blockId_idx" ON "hostel_rooms" ("blockId");

ALTER TABLE "hostel_rooms"
  ADD CONSTRAINT "hostel_rooms_blockId_fkey" FOREIGN KEY ("blockId")
  REFERENCES "hostel_blocks" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "hostel_allocations" (
  "id"                TEXT NOT NULL,
  "roomId"            TEXT NOT NULL,
  "studentProfileId"  TEXT NOT NULL,
  "allocatedOn"       TIMESTAMP(3) NOT NULL,
  "releasedOn"        TIMESTAMP(3),
  "allocatedByUserId" TEXT NOT NULL,
  "allocatedByName"   TEXT NOT NULL,
  "note"              TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "hostel_allocations_pkey" PRIMARY KEY ("id")
);

-- A bed given up before it was taken produces a negative stay, and every
-- report that counts nights is then quietly wrong for that child.
ALTER TABLE "hostel_allocations"
  ADD CONSTRAINT "hostel_allocations_released_after_allocated"
  CHECK ("releasedOn" IS NULL OR "releasedOn" >= "allocatedOn");

-- One open bed per child, anywhere in the school. Partial on releasedOn IS
-- NULL so a child who moves out in July can move into a different room in
-- September — a plain unique index would bar them from ever boarding again.
--
-- This is the constraint that matters most here: a child recorded in two
-- rooms at once is not an overbooked dormitory, it is a child who cannot be
-- found at ten at night.
CREATE UNIQUE INDEX IF NOT EXISTS "hostel_allocations_one_open_bed_per_student"
  ON "hostel_allocations" ("studentProfileId") WHERE "releasedOn" IS NULL;

CREATE INDEX IF NOT EXISTS "hostel_allocations_roomId_idx" ON "hostel_allocations" ("roomId");
CREATE INDEX IF NOT EXISTS "hostel_allocations_releasedOn_idx" ON "hostel_allocations" ("releasedOn");

ALTER TABLE "hostel_allocations"
  ADD CONSTRAINT "hostel_allocations_roomId_fkey" FOREIGN KEY ("roomId")
  REFERENCES "hostel_rooms" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hostel_allocations"
  ADD CONSTRAINT "hostel_allocations_studentProfileId_fkey" FOREIGN KEY ("studentProfileId")
  REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
