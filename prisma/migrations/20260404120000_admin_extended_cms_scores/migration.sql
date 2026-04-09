-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('TOURNAMENT', 'OPEN_DAY', 'CAMP', 'SCHOOL_VISIT', 'OTHER');

-- CreateEnum
CREATE TYPE "ContactInquiryStatus" AS ENUM ('UNREAD', 'READ', 'RESOLVED');

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Team" ADD COLUMN     "schoolName" TEXT,
ADD COLUMN     "photoId" TEXT;

-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "location" TEXT,
ADD COLUMN     "photoId" TEXT;

-- AlterTable
ALTER TABLE "LeagueStanding" ADD COLUMN     "goalsFor" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "goalsAgainst" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "CalendarEventType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "bannerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactInquiry" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "status" "ContactInquiryStatus" NOT NULL DEFAULT 'UNREAD',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactInquiry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildPerformance" (
    "id" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "goalsScored" INTEGER NOT NULL DEFAULT 0,
    "assists" INTEGER NOT NULL DEFAULT 0,
    "attendanceRate" DECIMAL(5,2) NOT NULL,
    "rating" INTEGER,
    "coachNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildPerformance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentStat" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "suffix" TEXT NOT NULL DEFAULT '',
    "label" TEXT NOT NULL,

    CONSTRAINT "ContentStat_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Testimonial" (
    "id" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "speaker" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Testimonial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentMediaSlot" (
    "slot" TEXT NOT NULL,
    "mediaId" TEXT,

    CONSTRAINT "ContentMediaSlot_pkey" PRIMARY KEY ("slot")
);

-- CreateIndex
CREATE INDEX "CalendarEvent_date_isPublic_idx" ON "CalendarEvent"("date", "isPublic");

-- CreateIndex
CREATE INDEX "ContactInquiry_status_submittedAt_idx" ON "ContactInquiry"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "ChildPerformance_childId_date_idx" ON "ChildPerformance"("childId", "date");

-- CreateIndex
CREATE INDEX "ChildPerformance_sessionId_idx" ON "ChildPerformance"("sessionId");

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarEvent" ADD CONSTRAINT "CalendarEvent_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildPerformance" ADD CONSTRAINT "ChildPerformance_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildPerformance" ADD CONSTRAINT "ChildPerformance_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentMediaSlot" ADD CONSTRAINT "ContentMediaSlot_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
