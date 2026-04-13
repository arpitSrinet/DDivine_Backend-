-- CreateEnum
CREATE TYPE "EventBookingStatus" AS ENUM (
  'DRAFT',
  'ATTENDEE_COMPLETED',
  'CONTACT_COMPLETED',
  'PAYMENT_SELECTED',
  'CONFIRMED',
  'CANCELLED',
  'EXPIRED'
);

-- CreateEnum
CREATE TYPE "EventPaymentMethod" AS ENUM ('STRIPE', 'TAX_FREE_CHILDCARE', 'CARD');

-- AlterTable
ALTER TABLE "CalendarEvent"
ADD COLUMN "addons" JSONB,
ADD COLUMN "category" TEXT,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN "endDate" TIMESTAMP(3),
ADD COLUMN "endTime" TEXT,
ADD COLUMN "maxAgeYears" INTEGER,
ADD COLUMN "minAgeYears" INTEGER,
ADD COLUMN "requirements" JSONB,
ADD COLUMN "serviceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "startDate" TIMESTAMP(3),
ADD COLUMN "startTime" TEXT,
ADD COLUMN "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "CalendarEventBooking"
ADD COLUMN "addonsTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "bookingReference" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "email" TEXT,
ADD COLUMN "fullName" TEXT,
ADD COLUMN "intentId" TEXT,
ADD COLUMN "medicalNotes" TEXT,
ADD COLUMN "paymentMethod" "EventPaymentMethod",
ADD COLUMN "phone" TEXT,
ADD COLUMN "receiptUrl" TEXT,
ADD COLUMN "serviceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
ADD COLUMN "stripeCheckoutSessionId" TEXT,
ADD COLUMN "stripePaymentIntentId" TEXT,
ADD COLUMN "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "taxFreeChildcareRef" TEXT,
ADD COLUMN "totalPaid" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "EventBookingIntent" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "childId" TEXT,
  "status" "EventBookingStatus" NOT NULL DEFAULT 'DRAFT',
  "currentStep" TEXT NOT NULL DEFAULT 'attendee',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "medicalNotes" TEXT,
  "addons" JSONB,
  "fullName" TEXT,
  "email" TEXT,
  "phone" TEXT,
  "paymentMethod" "EventPaymentMethod",
  "paymentProvider" TEXT,
  "taxFreeChildcareRef" TEXT,
  "stripeCheckoutSessionId" TEXT,
  "stripePaymentIntentId" TEXT,
  "stripeCheckoutUrl" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "subtotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "addonsTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "discountTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "serviceFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "total" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EventBookingIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventBooking_bookingReference_key" ON "CalendarEventBooking"("bookingReference");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventBooking_intentId_key" ON "CalendarEventBooking"("intentId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventBooking_stripeCheckoutSessionId_key" ON "CalendarEventBooking"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventBooking_stripePaymentIntentId_key" ON "CalendarEventBooking"("stripePaymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventBookingIntent_stripeCheckoutSessionId_key" ON "EventBookingIntent"("stripeCheckoutSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "EventBookingIntent_stripePaymentIntentId_key" ON "EventBookingIntent"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "EventBookingIntent_userId_createdAt_idx" ON "EventBookingIntent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EventBookingIntent_eventId_expiresAt_idx" ON "EventBookingIntent"("eventId", "expiresAt");

-- AddForeignKey
ALTER TABLE "CalendarEventBooking"
ADD CONSTRAINT "CalendarEventBooking_intentId_fkey"
FOREIGN KEY ("intentId") REFERENCES "EventBookingIntent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBookingIntent"
ADD CONSTRAINT "EventBookingIntent_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBookingIntent"
ADD CONSTRAINT "EventBookingIntent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventBookingIntent"
ADD CONSTRAINT "EventBookingIntent_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "Child"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
