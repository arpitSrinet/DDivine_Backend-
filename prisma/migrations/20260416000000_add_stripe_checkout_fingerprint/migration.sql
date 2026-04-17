-- AlterTable: add stripeCheckoutFingerprint to EventBookingIntent
ALTER TABLE "EventBookingIntent" ADD COLUMN "stripeCheckoutFingerprint" TEXT;
