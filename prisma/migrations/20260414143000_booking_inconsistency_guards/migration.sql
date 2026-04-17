-- Guard constraints for v2 booking consistency

-- 1) Prevent duplicate slot+child rows in same intent
CREATE UNIQUE INDEX IF NOT EXISTS "EventBookingIntentItem_intentId_slotId_childId_key"
  ON "EventBookingIntentItem"("intentId", "slotId", "childId");

-- 2) Enforce booking item event references
CREATE INDEX IF NOT EXISTS "CalendarEventBookingItem_eventId_idx"
  ON "CalendarEventBookingItem"("eventId");

CREATE INDEX IF NOT EXISTS "CalendarEventBookingItem_eventDateId_idx"
  ON "CalendarEventBookingItem"("eventDateId");

ALTER TABLE "CalendarEventBookingItem"
  ADD CONSTRAINT "CalendarEventBookingItem_eventId_fkey"
  FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEventBookingItem"
  ADD CONSTRAINT "CalendarEventBookingItem_eventDateId_fkey"
  FOREIGN KEY ("eventDateId") REFERENCES "CalendarEventDate"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
