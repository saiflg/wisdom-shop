-- One month-end check a bursar works through before approving a payroll.
--
-- Attached to the run rather than to a school-wide template: next month's
-- list is copied from last month's, so a school's own wording carries forward
-- without a template entity to keep in step, and each run keeps a record of
-- what was checked FOR THAT MONTH — which is what somebody needs when a
-- payslip is queried a year later.
CREATE TABLE "payroll_checklist_items" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    -- Null until somebody ticks it. The presence of a time IS the tick.
    "doneAt" TIMESTAMP(3),
    -- Stored by value like the payslip's staffName: who confirmed a check must
    -- still read correctly after they leave and their account is removed.
    "doneByUserId" TEXT,
    "doneByName" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_checklist_items_runId_idx" ON "payroll_checklist_items"("runId");

-- One of each check per run. Two items with the same wording means somebody
-- ticks one, believes the job is done, and the other sits there accusing them.
CREATE UNIQUE INDEX "payroll_checklist_items_runId_label_key" ON "payroll_checklist_items"("runId", "label");

ALTER TABLE "payroll_checklist_items" ADD CONSTRAINT "payroll_checklist_items_runId_fkey" FOREIGN KEY ("runId") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
