-- Buses, the runs they do, and who is on them.

CREATE TYPE "TransportDirection" AS ENUM ('MORNING', 'AFTERNOON', 'BOTH');

CREATE TABLE IF NOT EXISTS "transport_vehicles" (
  "id"          TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "plateNumber" TEXT,
  "seats"       INTEGER NOT NULL DEFAULT 0,
  "driverName"  TEXT,
  "driverPhone" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),
  CONSTRAINT "transport_vehicles_pkey" PRIMARY KEY ("id")
);

-- A negative seat count would make every capacity check pass by accident.
ALTER TABLE "transport_vehicles"
  ADD CONSTRAINT "transport_vehicles_seats_not_negative" CHECK ("seats" >= 0);

CREATE TABLE IF NOT EXISTS "transport_routes" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "vehicleId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "transport_routes_pkey" PRIMARY KEY ("id")
);

-- SET NULL: taking a bus off the road must not delete the route or the
-- children assigned to it. The route simply has no vehicle until one is put
-- back, and the seat check then says so in words.
ALTER TABLE "transport_routes"
  ADD CONSTRAINT "transport_routes_vehicleId_fkey" FOREIGN KEY ("vehicleId")
  REFERENCES "transport_vehicles" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "transport_stops" (
  "id"           TEXT NOT NULL,
  "routeId"      TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "position"     INTEGER NOT NULL DEFAULT 0,
  "pickupMinute" INTEGER,
  CONSTRAINT "transport_stops_pkey" PRIMARY KEY ("id")
);

-- A time of day, or nothing at all. Null is not midnight: it means the school
-- has not said yet, and a route half filled in must not read as broken.
ALTER TABLE "transport_stops"
  ADD CONSTRAINT "transport_stops_pickupMinute_is_a_time"
  CHECK ("pickupMinute" IS NULL OR ("pickupMinute" >= 0 AND "pickupMinute" <= 1439));

CREATE INDEX IF NOT EXISTS "transport_stops_routeId_idx" ON "transport_stops" ("routeId");

ALTER TABLE "transport_stops"
  ADD CONSTRAINT "transport_stops_routeId_fkey" FOREIGN KEY ("routeId")
  REFERENCES "transport_routes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "transport_assignments" (
  "id"               TEXT NOT NULL,
  "routeId"          TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "stopId"           TEXT,
  "direction"        "TransportDirection" NOT NULL DEFAULT 'BOTH',
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "transport_assignments_pkey" PRIMARY KEY ("id")
);

-- One place per child per route. Riding both ways is a direction, not two
-- rows; without this a double-click puts a child on the same bus twice and
-- takes a seat off somebody who needs one.
CREATE UNIQUE INDEX IF NOT EXISTS "transport_assignments_routeId_studentProfileId_key"
  ON "transport_assignments" ("routeId", "studentProfileId");

CREATE INDEX IF NOT EXISTS "transport_assignments_studentProfileId_idx"
  ON "transport_assignments" ("studentProfileId");

ALTER TABLE "transport_assignments"
  ADD CONSTRAINT "transport_assignments_routeId_fkey" FOREIGN KEY ("routeId")
  REFERENCES "transport_routes" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "transport_assignments"
  ADD CONSTRAINT "transport_assignments_studentProfileId_fkey" FOREIGN KEY ("studentProfileId")
  REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: removing a stop must not remove the children who got on there.
ALTER TABLE "transport_assignments"
  ADD CONSTRAINT "transport_assignments_stopId_fkey" FOREIGN KEY ("stopId")
  REFERENCES "transport_stops" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
