/*
  Warnings:

  - The `status` column on the `AssignedOrder` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `providerId` on the `AuthProvider` table. All the data in the column will be lost.
  - The `status` column on the `Friend` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `verified` on the `OTPCode` table. All the data in the column will be lost.
  - The `status` column on the `Order` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `Ride` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[provider,providerUserId]` on the table `AuthProvider` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[provider,userId]` on the table `AuthProvider` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `providerUserId` to the `AuthProvider` table without a default value. This is not possible if the table is not empty.
  - Changed the type of `provider` on the `AuthProvider` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `businessType` on the `Business` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `BusinessPost` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `Message` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `Post` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "SocialProvider" AS ENUM ('google', 'facebook', 'apple');

-- CreateEnum
CREATE TYPE "FriendStatus" AS ENUM ('pending', 'accepted', 'rejected', 'blocked');

-- CreateEnum
CREATE TYPE "PostType" AS ENUM ('image', 'video', 'text', 'reel');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'video', 'audio', 'file');

-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('restaurant', 'retail', 'service', 'logistics', 'other');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirmed', 'preparing', 'ready', 'assigned', 'in_transit', 'delivered', 'cancelled', 'refunded');

-- CreateEnum
CREATE TYPE "RideStatus" AS ENUM ('requested', 'accepted', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "AssignedOrderStatus" AS ENUM ('assigned', 'picked_up', 'in_transit', 'delivered', 'failed');

-- DropIndex
DROP INDEX "AuthProvider_provider_providerId_key";

-- DropIndex
DROP INDEX "OTPCode_email_verified_expiresAt_idx";

-- DropIndex
DROP INDEX "OTPCode_phone_verified_expiresAt_idx";

-- AlterTable
ALTER TABLE "AssignedOrder" DROP COLUMN "status",
ADD COLUMN     "status" "AssignedOrderStatus" NOT NULL DEFAULT 'assigned';

-- AlterTable
ALTER TABLE "AuthProvider" DROP COLUMN "providerId",
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "providerUserId" TEXT NOT NULL,
DROP COLUMN "provider",
ADD COLUMN     "provider" "SocialProvider" NOT NULL;

-- AlterTable
ALTER TABLE "Business" DROP COLUMN "businessType",
ADD COLUMN     "businessType" "BusinessType" NOT NULL;

-- AlterTable
ALTER TABLE "BusinessPost" DROP COLUMN "type",
ADD COLUMN     "type" "PostType" NOT NULL;

-- AlterTable
ALTER TABLE "Friend" DROP COLUMN "status",
ADD COLUMN     "status" "FriendStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Message" DROP COLUMN "type",
ADD COLUMN     "type" "MessageType" NOT NULL;

-- AlterTable
ALTER TABLE "OTPCode" DROP COLUMN "verified";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "status",
ADD COLUMN     "status" "OrderStatus" NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Post" DROP COLUMN "type",
ADD COLUMN     "type" "PostType" NOT NULL;

-- AlterTable
ALTER TABLE "Ride" DROP COLUMN "status",
ADD COLUMN     "status" "RideStatus" NOT NULL DEFAULT 'requested';

-- CreateIndex
CREATE UNIQUE INDEX "AuthProvider_provider_providerUserId_key" ON "AuthProvider"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthProvider_provider_userId_key" ON "AuthProvider"("provider", "userId");

-- CreateIndex
CREATE INDEX "Business_businessType_idx" ON "Business"("businessType");

-- CreateIndex
CREATE INDEX "Business_parentId_idx" ON "Business"("parentId");

-- CreateIndex
CREATE INDEX "OTPCode_phone_expiresAt_idx" ON "OTPCode"("phone", "expiresAt");

-- CreateIndex
CREATE INDEX "OTPCode_email_expiresAt_idx" ON "OTPCode"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "Order_status_idx" ON "Order"("status");

-- CreateIndex
CREATE INDEX "Ride_status_idx" ON "Ride"("status");

-- AddForeignKey
ALTER TABLE "Business" ADD CONSTRAINT "Business_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
