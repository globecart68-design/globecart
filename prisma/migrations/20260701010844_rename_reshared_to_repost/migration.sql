/*
  Warnings:

  - You are about to drop the column `resharedCount` on the `Post` table. All the data in the column will be lost.
  - You are about to drop the `Reshare` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Reshare" DROP CONSTRAINT "Reshare_originalPostId_fkey";

-- DropForeignKey
ALTER TABLE "Reshare" DROP CONSTRAINT "Reshare_postId_fkey";

-- DropForeignKey
ALTER TABLE "Reshare" DROP CONSTRAINT "Reshare_userId_fkey";

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "resharedCount",
ADD COLUMN     "repostCount" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "Reshare";

-- CreateTable
CREATE TABLE "Repost" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalPostId" TEXT NOT NULL,
    "caption" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT,

    CONSTRAINT "Repost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Repost_userId_idx" ON "Repost"("userId");

-- CreateIndex
CREATE INDEX "Repost_originalPostId_idx" ON "Repost"("originalPostId");

-- CreateIndex
CREATE INDEX "Repost_createdAt_idx" ON "Repost"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Repost_userId_originalPostId_key" ON "Repost"("userId", "originalPostId");

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_originalPostId_fkey" FOREIGN KEY ("originalPostId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repost" ADD CONSTRAINT "Repost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
