/*
  Warnings:

  - The primary key for the `SavedPost` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `Share` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the `Comment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Like` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[userId,postId]` on the table `SavedPost` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,postId]` on the table `Share` will be added. If there are existing duplicate values, this will fail.
  - The required column `id` was added to the `SavedPost` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - The required column `id` was added to the `Share` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.

*/
-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_postId_fkey";

-- DropForeignKey
ALTER TABLE "Comment" DROP CONSTRAINT "Comment_userId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_postId_fkey";

-- DropForeignKey
ALTER TABLE "Like" DROP CONSTRAINT "Like_userId_fkey";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "resharedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "savedCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sharesCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SavedPost" DROP CONSTRAINT "SavedPost_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "SavedPost_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Share" DROP CONSTRAINT "Share_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
ADD CONSTRAINT "Share_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Story" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropTable
DROP TABLE "Comment";

-- DropTable
DROP TABLE "Like";

-- CreateTable
CREATE TABLE "Reshare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalPostId" TEXT NOT NULL,
    "caption" VARCHAR(1000),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postId" TEXT,

    CONSTRAINT "Reshare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reshare_userId_idx" ON "Reshare"("userId");

-- CreateIndex
CREATE INDEX "Reshare_originalPostId_idx" ON "Reshare"("originalPostId");

-- CreateIndex
CREATE INDEX "Reshare_createdAt_idx" ON "Reshare"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reshare_userId_originalPostId_key" ON "Reshare"("userId", "originalPostId");

-- CreateIndex
CREATE INDEX "SavedPost_userId_idx" ON "SavedPost"("userId");

-- CreateIndex
CREATE INDEX "SavedPost_postId_idx" ON "SavedPost"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "SavedPost_userId_postId_key" ON "SavedPost"("userId", "postId");

-- CreateIndex
CREATE INDEX "Share_userId_idx" ON "Share"("userId");

-- CreateIndex
CREATE INDEX "Share_postId_idx" ON "Share"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "Share_userId_postId_key" ON "Share"("userId", "postId");

-- AddForeignKey
ALTER TABLE "Reshare" ADD CONSTRAINT "Reshare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reshare" ADD CONSTRAINT "Reshare_originalPostId_fkey" FOREIGN KEY ("originalPostId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reshare" ADD CONSTRAINT "Reshare_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
