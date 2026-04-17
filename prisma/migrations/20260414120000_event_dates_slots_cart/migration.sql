-- Migration: event dates, slots, cart-style intent items and booking items
-- Supports: single event, single-day multi-slot, multi-day, and multi-event bookings

-- ──────────────────────────────────────────────────────────
-- 1. Make eventId optional on EventBookingIntent
-- ──────────────────────────────────────────────────────────
ALTER TABLE "EventBookingIntent" ALTER COLUMN "eventId" DROP NOT NULL;

-- ──────────────────────────────────────────────────────────
-- 2. Make eventId optional on CalendarEventBooking
--    (multi-event orders have no single canonical event)
-- ──────────────────────────────────────────────────────────
ALTER TABLE "CalendarEventBooking" ALTER COLUMN "eventId" DROP NOT NULL;

-- Drop the old (eventId, userId, childId) unique constraint if it exists
ALTER TABLE "CalendarEventBooking" DROP CONSTRAINT IF EXISTS "CalendarEventBooking_eventId_userId_childId_key";

-- ──────────────────────────────────────────────────────────
-- 3. CalendarEventDate
-- ──────────────────────────────────────────────────────────
CREATE TABLE "CalendarEventDate" (
    "id"        TEXT         NOT NULL,
    "eventId"   TEXT         NOT NULL,
    "date"      TIMESTAMP(3) NOT NULL,
    "isClosed"  BOOLEAN      NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventDate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarEventDate_eventId_date_key"
    ON "CalendarEventDate"("eventId", "date");

CREATE INDEX "CalendarEventDate_eventId_idx"
    ON "CalendarEventDate"("eventId");

ALTER TABLE "CalendarEventDate"
    ADD CONSTRAINT "CalendarEventDate_eventId_fkey"
    FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────
-- 4. CalendarEventSlot
-- ──────────────────────────────────────────────────────────
CREATE TABLE "CalendarEventSlot" (
    "id"          TEXT         NOT NULL,
    "eventDateId" TEXT         NOT NULL,
    "startTime"   TEXT         NOT NULL,
    "endTime"     TEXT         NOT NULL,
    "capacity"    INTEGER      NOT NULL,
    "bookedCount" INTEGER      NOT NULL DEFAULT 0,
    "minAgeYears" INTEGER,
    "maxAgeYears" INTEGER,
    "price"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "serviceFee"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive"    BOOLEAN      NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CalendarEventSlot_eventDateId_startTime_endTime_key"
    ON "CalendarEventSlot"("eventDateId", "startTime", "endTime");

CREATE INDEX "CalendarEventSlot_eventDateId_idx"
    ON "CalendarEventSlot"("eventDateId");

ALTER TABLE "CalendarEventSlot"
    ADD CONSTRAINT "CalendarEventSlot_eventDateId_fkey"
    FOREIGN KEY ("eventDateId") REFERENCES "CalendarEventDate"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────
-- 5. EventBookingIntentItem
-- ──────────────────────────────────────────────────────────
CREATE TABLE "EventBookingIntentItem" (
    "id"              TEXT          NOT NULL,
    "intentId"        TEXT          NOT NULL,
    "slotId"          TEXT          NOT NULL,
    "childId"         TEXT,
    "medicalNotes"    TEXT,
    "addons"          JSONB,
    "lineSubtotal"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineAddonsTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineServiceFee"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineTotal"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EventBookingIntentItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EventBookingIntentItem_intentId_idx"
    ON "EventBookingIntentItem"("intentId");

CREATE INDEX "EventBookingIntentItem_slotId_idx"
    ON "EventBookingIntentItem"("slotId");

ALTER TABLE "EventBookingIntentItem"
    ADD CONSTRAINT "EventBookingIntentItem_intentId_fkey"
    FOREIGN KEY ("intentId") REFERENCES "EventBookingIntent"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventBookingIntentItem"
    ADD CONSTRAINT "EventBookingIntentItem_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "CalendarEventSlot"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EventBookingIntentItem"
    ADD CONSTRAINT "EventBookingIntentItem_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────
-- 6. CalendarEventBookingItem
-- ──────────────────────────────────────────────────────────
CREATE TABLE "CalendarEventBookingItem" (
    "id"              TEXT          NOT NULL,
    "bookingId"       TEXT          NOT NULL,
    "slotId"          TEXT          NOT NULL,
    "eventId"         TEXT          NOT NULL,
    "eventDateId"     TEXT          NOT NULL,
    "childId"         TEXT,
    "medicalNotes"    TEXT,
    "addons"          JSONB,
    "lineSubtotal"    DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineAddonsTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineServiceFee"  DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lineTotal"       DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt"       TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventBookingItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarEventBookingItem_bookingId_idx"
    ON "CalendarEventBookingItem"("bookingId");

CREATE INDEX "CalendarEventBookingItem_slotId_idx"
    ON "CalendarEventBookingItem"("slotId");

ALTER TABLE "CalendarEventBookingItem"
    ADD CONSTRAINT "CalendarEventBookingItem_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "CalendarEventBooking"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CalendarEventBookingItem"
    ADD CONSTRAINT "CalendarEventBookingItem_slotId_fkey"
    FOREIGN KEY ("slotId") REFERENCES "CalendarEventSlot"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEventBookingItem"
    ADD CONSTRAINT "CalendarEventBookingItem_childId_fkey"
    FOREIGN KEY ("childId") REFERENCES "Child"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
