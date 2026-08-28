-- Health information about children, and files about them.

CREATE TYPE "MedicalKind" AS ENUM ('ALLERGY', 'CONDITION', 'MEDICATION', 'NOTE');
CREATE TYPE "MedicalSeverity" AS ENUM ('LIFE_THREATENING', 'SIGNIFICANT', 'MINOR');

CREATE TABLE IF NOT EXISTS "medical_entries" (
  "id"               TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "kind"             "MedicalKind" NOT NULL,
  "severity"         "MedicalSeverity",
  "title"            TEXT NOT NULL,
  "detail"           TEXT,
  "action"           TEXT,
  "recordedByUserId" TEXT NOT NULL,
  "recordedByName"   TEXT NOT NULL,
  "archivedAt"       TIMESTAMP(3),
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "medical_entries_pkey" PRIMARY KEY ("id")
);

-- An allergy or condition must carry a severity, and a note must not.
--
-- The first half is the one that matters: an allergy with no severity is
-- precisely the entry somebody needs the severity of, and defaulting it would
-- be a clinical claim this software cannot make. The second stops "dislikes
-- swimming" being filed as a medical grading.
ALTER TABLE "medical_entries"
  ADD CONSTRAINT "medical_entries_severity_matches_kind"
  CHECK (
    ("kind" IN ('ALLERGY', 'CONDITION') AND "severity" IS NOT NULL)
    OR ("kind" = 'NOTE' AND "severity" IS NULL)
    OR ("kind" = 'MEDICATION')
  );

CREATE INDEX IF NOT EXISTS "medical_entries_studentProfileId_idx"
  ON "medical_entries" ("studentProfileId");

ALTER TABLE "medical_entries"
  ADD CONSTRAINT "medical_entries_studentProfileId_fkey" FOREIGN KEY ("studentProfileId")
  REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "student_documents" (
  "id"               TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "label"            TEXT NOT NULL,
  "storageKey"       TEXT NOT NULL,
  "mimeType"         TEXT NOT NULL,
  "bytes"            INTEGER NOT NULL,
  "uploadedByUserId" TEXT NOT NULL,
  "uploadedByName"   TEXT NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt"        TIMESTAMP(3),
  CONSTRAINT "student_documents_pkey" PRIMARY KEY ("id")
);

-- A zero-byte document is an upload that failed halfway, and it would sit in
-- the list looking like a birth certificate somebody had provided.
ALTER TABLE "student_documents"
  ADD CONSTRAINT "student_documents_bytes_positive" CHECK ("bytes" > 0);

-- One row per stored file. Without this a retried upload leaves two rows
-- pointing at one file, and deleting either takes the bytes from under the
-- other.
CREATE UNIQUE INDEX IF NOT EXISTS "student_documents_storageKey_key"
  ON "student_documents" ("storageKey");

CREATE INDEX IF NOT EXISTS "student_documents_studentProfileId_idx"
  ON "student_documents" ("studentProfileId");

ALTER TABLE "student_documents"
  ADD CONSTRAINT "student_documents_studentProfileId_fkey" FOREIGN KEY ("studentProfileId")
  REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
