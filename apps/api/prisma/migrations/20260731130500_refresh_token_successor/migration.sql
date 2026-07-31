-- Records which token replaced each rotated-out refresh token, so a replay
-- can be placed in the rotation chain. See src/auth/refresh-race.ts.
--
-- Written by hand rather than by `prisma migrate dev`: adding a unique
-- constraint makes that command ask for confirmation, and it refuses to run
-- non-interactively (which is how it is invoked in this container).

ALTER TABLE "refresh_tokens" ADD COLUMN "replacedById" TEXT;

-- One-to-one: a token replaces at most one predecessor.
CREATE UNIQUE INDEX "refresh_tokens_replacedById_key" ON "refresh_tokens"("replacedById");

-- SET NULL rather than CASCADE: pruning an old token must not delete the
-- newer one that replaced it.
ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_replacedById_fkey"
  FOREIGN KEY ("replacedById") REFERENCES "refresh_tokens"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
