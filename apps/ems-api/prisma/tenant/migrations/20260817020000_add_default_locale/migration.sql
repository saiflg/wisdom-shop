-- The language the console opens in for this school.
--
-- A default, not an instruction: anybody who picks a language for themselves
-- keeps it. Defaulted rather than nullable so a school that never opens the
-- setting behaves identically to one that did — the same reasoning as every
-- other column on this table.
ALTER TABLE "branding_settings" ADD COLUMN "defaultLocale" TEXT NOT NULL DEFAULT 'en';
