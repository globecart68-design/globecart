-- DropIndex
DROP INDEX "OTPCode_email_expiresAt_idx";

-- DropIndex
DROP INDEX "OTPCode_phone_expiresAt_idx";

-- AlterTable
ALTER TABLE "OTPCode" ADD COLUMN     "purpose" TEXT NOT NULL DEFAULT 'auth';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordHash" TEXT;

-- CreateIndex
CREATE INDEX "OTPCode_phone_purpose_expiresAt_idx" ON "OTPCode"("phone", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "OTPCode_email_purpose_expiresAt_idx" ON "OTPCode"("email", "purpose", "expiresAt");
