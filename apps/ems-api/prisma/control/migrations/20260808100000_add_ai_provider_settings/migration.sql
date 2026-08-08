-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OPENROUTER', 'OPENAI', 'ANTHROPIC', 'GOOGLE_GEMINI', 'OPENAI_COMPATIBLE');

-- CreateTable
CREATE TABLE "ai_provider_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "provider" "AiProvider" NOT NULL DEFAULT 'OPENROUTER',
    "apiKeyEncrypted" TEXT,
    "model" TEXT,
    "baseUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastTestedAt" TIMESTAMP(3),
    "lastTestOk" BOOLEAN,
    "lastTestError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_provider_settings_pkey" PRIMARY KEY ("id")
);

-- One row, always. The settings page reads it rather than create-if-missing
-- logic scattered through the service.
INSERT INTO "ai_provider_settings" ("id", "updatedAt") VALUES (1, now());
