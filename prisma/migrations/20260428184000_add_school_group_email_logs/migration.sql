CREATE TABLE "SchoolGroupEmailLog" (
  "id" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "targetStatus" TEXT NOT NULL,
  "recipientsCount" INTEGER NOT NULL,
  "sentCount" INTEGER NOT NULL,
  "sentByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SchoolGroupEmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SchoolGroupEmailLog_createdAt_idx" ON "SchoolGroupEmailLog"("createdAt");
