-- Backfill legacy pending rows to explicit pending-payment state.
-- Runs in a separate migration so the new enum value is committed first.
UPDATE "Booking"
SET "status" = 'PENDING_PAYMENT'
WHERE "status" = 'PENDING';
