-- Add school-approval flag used to gate school-only game creation.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isSchoolApproved" BOOLEAN NOT NULL DEFAULT false;

-- Keep currently onboarded schools operational after rollout.
UPDATE "User"
SET "isSchoolApproved" = true
WHERE "role" = 'SCHOOL';
