-- CreateEnum
CREATE TYPE "SmtpEncryption" AS ENUM ('NONE', 'TLS', 'SSL');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('PAYSTACK', 'FLUTTERWAVE', 'STRIPE');

-- CreateTable
CREATE TABLE "email_gateway_settings" (
    "id" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "username" TEXT,
    "passwordEncrypted" TEXT,
    "encryption" "SmtpEncryption" NOT NULL DEFAULT 'TLS',
    "senderName" TEXT,
    "senderEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_gateway_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_gateway_settings" (
    "id" TEXT NOT NULL,
    "providerName" TEXT,
    "baseUrl" TEXT,
    "apiKeyEncrypted" TEXT,
    "apiSecretEncrypted" TEXT,
    "senderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_gateway_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_gateway_settings" (
    "id" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT,
    "phoneNumberId" TEXT,
    "businessAccountId" TEXT,
    "webhookUrl" TEXT,
    "webhookVerifyTokenEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_gateway_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "push_gateway_settings" (
    "id" TEXT NOT NULL,
    "providerName" TEXT,
    "credentialsEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "push_gateway_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_gateway_settings" (
    "id" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "publicKey" TEXT,
    "secretKeyEncrypted" TEXT,
    "webhookSecretEncrypted" TEXT,
    "currency" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_gateway_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_gateway_settings_provider_key" ON "payment_gateway_settings"("provider");
