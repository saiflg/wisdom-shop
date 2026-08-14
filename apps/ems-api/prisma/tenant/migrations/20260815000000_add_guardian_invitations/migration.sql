-- An invitation for a parent to set up their own portal password.
--
-- The office creates one and sends the link; the parent chooses the password.
-- Nobody at the school ever knows it — which is the whole point, because an
-- administrator who types a parent's password can sign in as that family and
-- read their child's record.
--
-- Only the SHA-256 digest of the token is stored, exactly like refresh_tokens:
-- a leak of this table hands out nothing usable.
CREATE TABLE "guardian_invitations" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    -- Set once, when the parent chooses their password. Single use is enforced
    -- here rather than by deleting the row, so an office can still see that an
    -- invitation was taken up and when.
    "acceptedAt" TIMESTAMP(3),
    -- Set when a newer invitation supersedes this one, or the office cancels it.
    "revokedAt" TIMESTAMP(3),
    -- SUPERSEDED or CANCELLED. Both are "revoked" to the system and mean
    -- completely different things to the parent holding the link: one has a
    -- newer email waiting, the other has nothing to look for.
    "revokedReason" TEXT,
    -- Who sent it, stored by value alongside the id so it still reads correctly
    -- after that member of staff leaves.
    "createdByUserId" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_invitations_pkey" PRIMARY KEY ("id")
);

-- Unique so a token can only ever identify one invitation, and so a redemption
-- is a single indexed lookup rather than a scan.
CREATE UNIQUE INDEX "guardian_invitations_tokenHash_key" ON "guardian_invitations"("tokenHash");

CREATE INDEX "guardian_invitations_userId_idx" ON "guardian_invitations"("userId");

ALTER TABLE "guardian_invitations" ADD CONSTRAINT "guardian_invitations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
