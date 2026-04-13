-- Add capacity columns to CalendarEvent for real-time slot availability
ALTER TABLE "CalendarEvent"
  ADD COLUMN IF NOT EXISTS "maxCapacity"     INTEGER,
  ADD COLUMN IF NOT EXISTS "currentCapacity" INTEGER NOT NULL DEFAULT 0;
