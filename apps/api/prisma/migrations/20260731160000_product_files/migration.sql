-- Downloadable artefacts attached to a product.
--
-- Only the storage key is recorded, never a URL: these files must never be
-- reachable without an entitlement check, so there is deliberately no address
-- that could be shared or guessed. See src/downloads.
--
-- Hand-written for the same reason as the refresh-token migration: adding a
-- unique constraint makes `prisma migrate dev` ask for confirmation, and it
-- refuses to run non-interactively.

CREATE TABLE "product_files" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_files_storageKey_key" ON "product_files"("storageKey");
CREATE INDEX "product_files_productId_idx" ON "product_files"("productId");

-- CASCADE: deleting a product should not leave orphaned file rows pointing at
-- bytes nobody can reach.
ALTER TABLE "product_files"
  ADD CONSTRAINT "product_files_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "products"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
