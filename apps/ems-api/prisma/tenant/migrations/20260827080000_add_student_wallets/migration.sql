-- Money a family places with the school for a child to draw on.

CREATE TYPE "WalletEntryKind" AS ENUM (
  'TOPUP', 'REFUND', 'SPEND', 'ADJUSTMENT_CREDIT', 'ADJUSTMENT_DEBIT'
);

CREATE TABLE IF NOT EXISTS "student_wallets" (
  "id"               TEXT NOT NULL,
  "studentProfileId" TEXT NOT NULL,
  "balanceCents"     INTEGER NOT NULL DEFAULT 0,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"        TIMESTAMP(3) NOT NULL,
  CONSTRAINT "student_wallets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "student_wallets_studentProfileId_key"
  ON "student_wallets" ("studentProfileId");

-- The whole safety argument for the stored balance.
--
-- Spending is applied as balanceCents = balanceCents + n, which Postgres
-- serialises per row, and this constraint fails the statement when the money
-- is not there. Two tills serving the same child at the same moment cannot
-- both succeed, which a read-the-balance-then-write check could never
-- guarantee no matter how it was written.
ALTER TABLE "student_wallets"
  ADD CONSTRAINT "student_wallets_balance_not_negative" CHECK ("balanceCents" >= 0);

ALTER TABLE "student_wallets"
  ADD CONSTRAINT "student_wallets_studentProfileId_fkey" FOREIGN KEY ("studentProfileId")
  REFERENCES "student_profiles" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "wallet_entries" (
  "id"                TEXT NOT NULL,
  "walletId"          TEXT NOT NULL,
  "kind"              "WalletEntryKind" NOT NULL,
  "amountCents"       INTEGER NOT NULL,
  "balanceAfterCents" INTEGER NOT NULL,
  "description"       TEXT NOT NULL,
  "reference"         TEXT,
  "recordedByUserId"  TEXT NOT NULL,
  "recordedByName"    TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "wallet_entries_pkey" PRIMARY KEY ("id")
);

-- A replayed gateway webhook must never credit a family twice. Many rows may
-- have no reference (cash at the office); only one may carry any given one.
CREATE UNIQUE INDEX IF NOT EXISTS "wallet_entries_walletId_reference_key"
  ON "wallet_entries" ("walletId", "reference");

CREATE INDEX IF NOT EXISTS "wallet_entries_walletId_createdAt_idx"
  ON "wallet_entries" ("walletId", "createdAt");

-- An entry of zero is not a movement, it is a mistake that made it through.
ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_amount_not_zero" CHECK ("amountCents" <> 0);

ALTER TABLE "wallet_entries"
  ADD CONSTRAINT "wallet_entries_walletId_fkey" FOREIGN KEY ("walletId")
  REFERENCES "student_wallets" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
