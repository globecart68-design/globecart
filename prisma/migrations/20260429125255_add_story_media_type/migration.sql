-- DropIndex
DROP INDEX "Story_expiresAt_idx";

-- DropIndex
DROP INDEX "Story_userId_idx";

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "mediaType" TEXT NOT NULL DEFAULT 'image',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Story_userId_expiresAt_idx" ON "Story"("userId", "expiresAt");
