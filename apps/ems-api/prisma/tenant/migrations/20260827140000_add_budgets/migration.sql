-- What a school intends to spend, category by category, compared against the
-- expenses that actually landed.

CREATE TABLE IF NOT EXISTS "budgets" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "academicYear"    TEXT NOT NULL,
  "term"            TEXT,
  "fromDate"        TIMESTAMP(3) NOT NULL,
  "toDate"          TIMESTAMP(3) NOT NULL,
  "createdByUserId" TEXT,
  "createdByName"   TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  "deletedAt"       TIMESTAMP(3),
  CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- A budget that ends before it starts matches no spending at all and looks
-- like an untouched allowance.
ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_period_ordered" CHECK ("toDate" >= "fromDate");

CREATE INDEX IF NOT EXISTS "budgets_period_idx" ON "budgets" ("fromDate", "toDate");

CREATE TABLE IF NOT EXISTS "budget_lines" (
  "id"          TEXT NOT NULL,
  "budgetId"    TEXT NOT NULL,
  "category"    TEXT NOT NULL,
  "amountCents" INTEGER NOT NULL,
  CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- Zero is allowed — "we are budgeting nothing for this" is a real decision —
-- but a negative allowance is not a decision, it is a typo.
ALTER TABLE "budget_lines"
  ADD CONSTRAINT "budget_lines_amount_not_negative" CHECK ("amountCents" >= 0);

-- On lower(category), because that is how spending is matched to a line. Two
-- lines differing only by capitals would each get a row, spending would land
-- on whichever matched first, and the other would sit at zero looking
-- deliberately unspent.
CREATE UNIQUE INDEX IF NOT EXISTS "budget_lines_budgetId_category_key"
  ON "budget_lines" ("budgetId", lower("category"));

CREATE INDEX IF NOT EXISTS "budget_lines_budgetId_idx" ON "budget_lines" ("budgetId");

ALTER TABLE "budget_lines"
  ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId")
  REFERENCES "budgets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
