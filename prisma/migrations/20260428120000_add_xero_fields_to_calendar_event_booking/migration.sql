-- AlterTable: add Xero invoice tracking fields to CalendarEventBooking
ALTER TABLE "CalendarEventBooking"
  ADD COLUMN IF NOT EXISTS "xeroInvoiceId"       TEXT,
  ADD COLUMN IF NOT EXISTS "xeroInvoiceStatus"   TEXT,
  ADD COLUMN IF NOT EXISTS "xeroInvoiceSyncedAt" TIMESTAMP(3);
