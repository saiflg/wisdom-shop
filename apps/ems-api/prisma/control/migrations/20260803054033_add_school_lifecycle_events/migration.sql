-- CreateTable
CREATE TABLE "school_lifecycle_events" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "fromStatus" "SchoolStatus" NOT NULL,
    "toStatus" "SchoolStatus" NOT NULL,
    "reason" TEXT NOT NULL,
    "actorPlatformUserId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_lifecycle_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "school_lifecycle_events_schoolId_idx" ON "school_lifecycle_events"("schoolId");

-- AddForeignKey
ALTER TABLE "school_lifecycle_events" ADD CONSTRAINT "school_lifecycle_events_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
