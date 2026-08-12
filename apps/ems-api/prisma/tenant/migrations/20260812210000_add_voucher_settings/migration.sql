-- How this school wants its salary voucher laid out. One row per school:
-- the tenant database holds exactly one school, so this is a singleton in the
-- same way curriculum_settings is.
--
-- `columns` is JSON rather than rows in a table because the ORDER is the
-- meaning: a voucher is a sequence of columns, and expressing that in SQL
-- needs a position column that must be kept dense on every edit. A single
-- document rewritten wholesale cannot get out of order.
CREATE TABLE "voucher_settings" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'GENERAL VOUCHER',
    "rowsPerPage" INTEGER NOT NULL DEFAULT 16,
    "columns" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voucher_settings_pkey" PRIMARY KEY ("id")
);
