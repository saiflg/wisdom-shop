-- CreateTable
CREATE TABLE "branding_settings" (
    "id" TEXT NOT NULL,
    "displayName" TEXT,
    "tagline" TEXT,
    "logoKey" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1d4ed8',
    "accentColor" TEXT NOT NULL DEFAULT '#0f766e',
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branding_settings_pkey" PRIMARY KEY ("id")
);
