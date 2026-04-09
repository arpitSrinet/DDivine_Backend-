-- CreateTable
CREATE TABLE "CalendarEventBooking" (
  "id" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "childId" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CalendarEventBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarEventBooking_eventId_idx" ON "CalendarEventBooking"("eventId");

-- CreateIndex
CREATE INDEX "CalendarEventBooking_userId_createdAt_idx" ON "CalendarEventBooking"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarEventBooking_eventId_userId_childId_key" ON "CalendarEventBooking"("eventId", "userId", "childId");

-- AddForeignKey
ALTER TABLE "CalendarEventBooking"
ADD CONSTRAINT "CalendarEventBooking_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventBooking"
ADD CONSTRAINT "CalendarEventBooking_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEventBooking"
ADD CONSTRAINT "CalendarEventBooking_childId_fkey"
FOREIGN KEY ("childId") REFERENCES "Child"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
