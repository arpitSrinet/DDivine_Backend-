-- Expand booking status model to support checkout and government-payment flows.
-- NOTE: ALTER TYPE ADD VALUE cannot be used alongside references to the new value
-- in the same transaction. Backfill is in the next migration.
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'GOVERNMENT_PAYMENT_PENDING';
ALTER TYPE "BookingStatus" ADD VALUE IF NOT EXISTS 'REFUNDED';
