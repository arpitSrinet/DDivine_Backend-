CREATE TYPE "LeagueGameRequestStatus" AS ENUM ('SUBMITTED');

CREATE TABLE "LeagueGameRequest" (
  "id" TEXT NOT NULL,
  "status" "LeagueGameRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "yearGroup" TEXT NOT NULL,
  "playingAt" TEXT NOT NULL,
  "gameDate" TIMESTAMP(3) NOT NULL,
  "gameTime" TEXT NOT NULL,
  "addressLine1" TEXT NOT NULL,
  "addressLine2" TEXT,
  "town" TEXT NOT NULL,
  "postCode" TEXT NOT NULL,
  "ip" TEXT,
  "userAgent" TEXT,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeagueGameRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeagueGameRequest_status_submittedAt_idx"
  ON "LeagueGameRequest"("status", "submittedAt");

CREATE INDEX "LeagueGameRequest_gameDate_idx"
  ON "LeagueGameRequest"("gameDate");
