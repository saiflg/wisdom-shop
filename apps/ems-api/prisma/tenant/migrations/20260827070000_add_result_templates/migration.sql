-- A reusable shape for a term's assessments: "CA1 10, CA2 10, CA3 10, Exam 70".
-- Applying one writes ordinary rows into "assessments" and then stops; nothing
-- reads back through the template afterwards.

CREATE TABLE IF NOT EXISTS "result_templates" (
  "id"          TEXT NOT NULL,
  "name"        TEXT NOT NULL,
  "description" TEXT,
  "isDefault"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  "deletedAt"   TIMESTAMP(3),
  CONSTRAINT "result_templates_pkey" PRIMARY KEY ("id")
);

-- One "Junior CA + Exam", whatever capitals the second person uses. Partial so
-- a deleted template's name is free again.
CREATE UNIQUE INDEX IF NOT EXISTS "result_templates_name_active_key"
  ON "result_templates" (lower("name")) WHERE "deletedAt" IS NULL;

CREATE TABLE IF NOT EXISTS "result_template_components" (
  "id"                 TEXT NOT NULL,
  "templateId"         TEXT NOT NULL,
  "name"               TEXT NOT NULL,
  "maxScoreHundredths" INTEGER NOT NULL DEFAULT 10000,
  "weightPercent"      INTEGER NOT NULL,
  "position"           INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "result_template_components_pkey" PRIMARY KEY ("id")
);

-- Assessments are unique by name within a subject/class/term, so two rows
-- called "CA1" in one template would create one assessment and silently drop
-- the other. Caught here instead.
CREATE UNIQUE INDEX IF NOT EXISTS "result_template_components_templateId_name_key"
  ON "result_template_components" ("templateId", "name");

CREATE INDEX IF NOT EXISTS "result_template_components_templateId_idx"
  ON "result_template_components" ("templateId");

-- CASCADE here is right where it was wrong for sections: a component has no
-- meaning without its template, and deleting one takes no student data with it.
ALTER TABLE "result_template_components"
  ADD CONSTRAINT "result_template_components_templateId_fkey" FOREIGN KEY ("templateId")
  REFERENCES "result_templates" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
