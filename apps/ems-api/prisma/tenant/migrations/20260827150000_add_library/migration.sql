-- Books the school owns, and who has them.

CREATE TABLE IF NOT EXISTS "library_books" (
  "id"        TEXT NOT NULL,
  "title"     TEXT NOT NULL,
  "author"    TEXT,
  "isbn"      TEXT,
  "category"  TEXT,
  "copies"    INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- A negative number of copies is not a shortage, it is a typo, and it would
-- make "available" arithmetic lie in a direction nobody can act on.
ALTER TABLE "library_books"
  ADD CONSTRAINT "library_books_copies_not_negative" CHECK ("copies" >= 0);

CREATE INDEX IF NOT EXISTS "library_books_title_idx" ON "library_books" ("title");

CREATE TABLE IF NOT EXISTS "library_loans" (
  "id"               TEXT NOT NULL,
  "bookId"           TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "borrowedOn"       TIMESTAMP(3) NOT NULL,
  "dueOn"            TIMESTAMP(3) NOT NULL,
  "returnedOn"       TIMESTAMP(3),
  "issuedByUserId"   TEXT NOT NULL,
  "issuedByName"     TEXT NOT NULL,
  "returnedToUserId" TEXT,
  "returnedToName"   TEXT,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "library_loans_pkey" PRIMARY KEY ("id")
);

-- A book cannot be due before it was borrowed, and cannot come back before it
-- went out. Both are the kind of nonsense that only appears via an import or
-- a mistyped correction, and both would produce fictional overdue days.
ALTER TABLE "library_loans"
  ADD CONSTRAINT "library_loans_due_after_borrowed" CHECK ("dueOn" >= "borrowedOn");
ALTER TABLE "library_loans"
  ADD CONSTRAINT "library_loans_returned_after_borrowed"
  CHECK ("returnedOn" IS NULL OR "returnedOn" >= "borrowedOn");

-- One child cannot have two copies of the same title out at once. Partial, so
-- returning it frees them to borrow it again next term.
CREATE UNIQUE INDEX IF NOT EXISTS "library_loans_one_open_per_book_per_student"
  ON "library_loans" ("bookId", "studentProfileId") WHERE "returnedOn" IS NULL;

CREATE INDEX IF NOT EXISTS "library_loans_bookId_idx" ON "library_loans" ("bookId");
CREATE INDEX IF NOT EXISTS "library_loans_studentProfileId_idx" ON "library_loans" ("studentProfileId");
CREATE INDEX IF NOT EXISTS "library_loans_returnedOn_idx" ON "library_loans" ("returnedOn");

ALTER TABLE "library_loans"
  ADD CONSTRAINT "library_loans_bookId_fkey" FOREIGN KEY ("bookId")
  REFERENCES "library_books" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "library_loans"
  ADD CONSTRAINT "library_loans_studentProfileId_fkey" FOREIGN KEY ("studentProfileId")
  REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
