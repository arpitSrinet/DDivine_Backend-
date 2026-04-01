-- AlterTable
ALTER TABLE "Child" ADD COLUMN     "firstAidPermission" TEXT,
ADD COLUMN     "schoolName" TEXT,
ALTER COLUMN "yearGroup" SET DEFAULT 'Not specified';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emergencyPhone" TEXT,
ADD COLUMN     "registrationNumber" TEXT,
ADD COLUMN     "schoolLogoFileName" TEXT,
ADD COLUMN     "schoolType" TEXT,
ADD COLUMN     "verificationDocumentFileName" TEXT,
ADD COLUMN     "website" TEXT;
