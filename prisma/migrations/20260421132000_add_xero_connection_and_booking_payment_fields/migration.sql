-- Add payment type + Xero tracking fields on Booking
CREATE TYPE "PaymentType" AS ENUM ('STRIPE', 'GOVERNMENT');

ALTER TABLE "Booking"
  ADD COLUMN "paymentType" "PaymentType" NOT NULL DEFAULT 'STRIPE',
  ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "xeroInvoiceId" TEXT,
  ADD COLUMN "xeroInvoiceStatus" TEXT,
  ADD COLUMN "xeroInvoiceSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Booking_xeroInvoiceId_key" ON "Booking"("xeroInvoiceId");

-- Store a single active OAuth connection for Xero
CREATE TABLE "XeroConnection" (
  "id" TEXT NOT NULL,
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "tokenType" TEXT NOT NULL DEFAULT 'Bearer',
  "scope" TEXT,
  "tenantId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "XeroConnection_pkey" PRIMARY KEY ("id")
);
