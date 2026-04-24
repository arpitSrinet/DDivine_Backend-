-- Add approval workflow fields for LeagueGameRequest and Match.

-- 1) Expand enum for request status
ALTER TYPE "LeagueGameRequestStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "LeagueGameRequestStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

-- 2) LeagueGameRequest review fields and approved match link
ALTER TABLE "LeagueGameRequest"
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "rejectionReason" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedMatchId" TEXT;

-- 3) Match provenance fields (approved context)
ALTER TABLE "Match"
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedByAdminId" TEXT,
  ADD COLUMN IF NOT EXISTS "approvedViaLeagueGameRequestId" TEXT;

-- Helpful indexes for admin queue/history
CREATE INDEX IF NOT EXISTS "LeagueGameRequest_reviewedAt_idx" ON "LeagueGameRequest"("reviewedAt");
CREATE INDEX IF NOT EXISTS "Match_approvedAt_idx" ON "Match"("approvedAt");

