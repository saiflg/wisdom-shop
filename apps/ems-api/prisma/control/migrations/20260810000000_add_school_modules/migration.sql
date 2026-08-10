-- Per-school module entitlements.
--
-- Both columns are additive and safe against running code: an empty
-- `modules` array is read as "this plan has no opinion, use the defaults"
-- rather than "nothing included", so every existing school keeps working
-- between this migration and the deploy that follows it.

ALTER TABLE "subscription_plans" ADD COLUMN "modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Null means "whatever the plan says". Only schools with a negotiated
-- exception ever get a value here.
ALTER TABLE "schools" ADD COLUMN "moduleOverrides" JSONB;

-- One row per module changed, so the history reads as decisions rather than
-- diffs. `module` is a plain string, not an enum: this is history and must
-- survive a module being renamed or retired.
CREATE TABLE "school_module_changes" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "actorPlatformUserId" TEXT NOT NULL,
    "actorEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_module_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "school_module_changes_schoolId_createdAt_idx"
    ON "school_module_changes"("schoolId", "createdAt");

ALTER TABLE "school_module_changes"
    ADD CONSTRAINT "school_module_changes_schoolId_fkey"
    FOREIGN KEY ("schoolId") REFERENCES "schools"("id") ON DELETE CASCADE ON UPDATE CASCADE;
