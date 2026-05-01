DO $$
BEGIN
  CREATE TYPE "SchoolApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE "User"
ADD COLUMN "schoolApprovalStatus" "SchoolApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "schoolApprovedAt" TIMESTAMP(3),
ADD COLUMN "schoolRejectedAt" TIMESTAMP(3),
ADD COLUMN "schoolLastReviewedAt" TIMESTAMP(3),
ADD COLUMN "schoolReviewedByAdminId" TEXT,
ADD COLUMN "schoolApprovalReason" TEXT;

UPDATE "User"
SET "schoolApprovalStatus" = CASE
  WHEN "isSchoolApproved" = TRUE THEN 'APPROVED'::"SchoolApprovalStatus"
  ELSE 'PENDING'::"SchoolApprovalStatus"
END,
"schoolApprovedAt" = CASE
  WHEN "isSchoolApproved" = TRUE THEN COALESCE("updatedAt", CURRENT_TIMESTAMP)
  ELSE NULL
END,
"schoolLastReviewedAt" = CASE
  WHEN "isSchoolApproved" = TRUE THEN COALESCE("updatedAt", CURRENT_TIMESTAMP)
  ELSE NULL
END
WHERE "role" = 'SCHOOL';
