/*
  Warnings:

  - You are about to drop the column `purpose` on the `OTPCode` table. All the data in the column will be lost.
  - You are about to drop the column `passwordHash` on the `User` table. All the data in the column will be lost.
  - Added the required column `dropLat` to the `Ride` table without a default value. This is not possible if the table is not empty.
  - Added the required column `dropLng` to the `Ride` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickupLat` to the `Ride` table without a default value. This is not possible if the table is not empty.
  - Added the required column `pickupLng` to the `Ride` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "MusicSource" AS ENUM ('library', 'original');

-- CreateEnum
CREATE TYPE "MusicStatus" AS ENUM ('processing', 'ready', 'blocked');

-- CreateEnum
CREATE TYPE "DropoffPreference" AS ENUM ('ring_bell', 'call_me', 'leave_at_door');

-- CreateEnum
CREATE TYPE "TrackingStatus" AS ENUM ('order_confirmed', 'preparing', 'picked_up', 'on_the_way', 'delivered');

-- DropForeignKey
ALTER TABLE "Ride" DROP CONSTRAINT "Ride_driverId_fkey";

-- DropIndex
DROP INDEX "OTPCode_email_purpose_expiresAt_idx";

-- DropIndex
DROP INDEX "OTPCode_phone_purpose_expiresAt_idx";

-- AlterTable
ALTER TABLE "BusinessPost" ADD COLUMN     "musicDuration" INTEGER,
ADD COLUMN     "musicId" TEXT,
ADD COLUMN     "musicStart" INTEGER DEFAULT 0,
ADD COLUMN     "musicVolume" DOUBLE PRECISION DEFAULT 1.0;

-- AlterTable
ALTER TABLE "BusinessStory" ADD COLUMN     "musicDuration" INTEGER,
ADD COLUMN     "musicId" TEXT,
ADD COLUMN     "musicStart" INTEGER DEFAULT 0,
ADD COLUMN     "musicVolume" DOUBLE PRECISION DEFAULT 1.0;

-- AlterTable
ALTER TABLE "OTPCode" DROP COLUMN "purpose";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "musicDuration" INTEGER,
ADD COLUMN     "musicId" TEXT,
ADD COLUMN     "musicStart" INTEGER DEFAULT 0,
ADD COLUMN     "musicVolume" DOUBLE PRECISION DEFAULT 1.0;

-- AlterTable
ALTER TABLE "Ride" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "distanceKm" DOUBLE PRECISION,
ADD COLUMN     "dropLat" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "dropLng" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "etaMinutes" INTEGER,
ADD COLUMN     "pickupLat" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "pickupLng" DOUBLE PRECISION NOT NULL,
ADD COLUMN     "startedAt" TIMESTAMP(3),
ADD COLUMN     "vehicleType" TEXT NOT NULL DEFAULT 'economy',
ALTER COLUMN "driverId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Story" ADD COLUMN     "musicDuration" INTEGER,
ADD COLUMN     "musicId" TEXT,
ADD COLUMN     "musicStart" INTEGER DEFAULT 0,
ADD COLUMN     "musicVolume" DOUBLE PRECISION DEFAULT 1.0;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "passwordHash";

-- CreateTable
CREATE TABLE "Music" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT NOT NULL,
    "album" TEXT,
    "artworkUrl" TEXT,
    "audioUrl" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "source" "MusicSource" NOT NULL DEFAULT 'library',
    "status" "MusicStatus" NOT NULL DEFAULT 'ready',
    "uploadedById" TEXT,
    "playCount" INTEGER NOT NULL DEFAULT 0,
    "useCount" INTEGER NOT NULL DEFAULT 0,
    "favoriteCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Music_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MusicFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "musicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MusicFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "fullAddress" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "building" TEXT,
    "floor" TEXT,
    "apartment" TEXT,
    "instructions" TEXT,
    "dropoffPreference" "DropoffPreference" NOT NULL DEFAULT 'ring_bell',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTracking" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "TrackingStatus" NOT NULL DEFAULT 'order_confirmed',
    "driverLat" DOUBLE PRECISION,
    "driverLng" DOUBLE PRECISION,
    "etaMinutes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderTracking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTrackingEvent" (
    "id" TEXT NOT NULL,
    "trackingId" TEXT NOT NULL,
    "status" "TrackingStatus" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderTrackingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Music_title_idx" ON "Music"("title");

-- CreateIndex
CREATE INDEX "Music_artist_idx" ON "Music"("artist");

-- CreateIndex
CREATE INDEX "Music_uploadedById_idx" ON "Music"("uploadedById");

-- CreateIndex
CREATE INDEX "Music_createdAt_idx" ON "Music"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "Music_source_idx" ON "Music"("source");

-- CreateIndex
CREATE INDEX "Music_status_idx" ON "Music"("status");

-- CreateIndex
CREATE INDEX "MusicFavorite_userId_idx" ON "MusicFavorite"("userId");

-- CreateIndex
CREATE INDEX "MusicFavorite_musicId_idx" ON "MusicFavorite"("musicId");

-- CreateIndex
CREATE UNIQUE INDEX "MusicFavorite_userId_musicId_key" ON "MusicFavorite"("userId", "musicId");

-- CreateIndex
CREATE INDEX "Address_userId_idx" ON "Address"("userId");

-- CreateIndex
CREATE INDEX "Address_userId_isDefault_idx" ON "Address"("userId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "OrderTracking_orderId_key" ON "OrderTracking"("orderId");

-- CreateIndex
CREATE INDEX "OrderTracking_orderId_idx" ON "OrderTracking"("orderId");

-- CreateIndex
CREATE INDEX "OrderTrackingEvent_trackingId_idx" ON "OrderTrackingEvent"("trackingId");

-- CreateIndex
CREATE INDEX "OrderTrackingEvent_createdAt_idx" ON "OrderTrackingEvent"("createdAt");

-- CreateIndex
CREATE INDEX "BusinessPost_musicId_idx" ON "BusinessPost"("musicId");

-- CreateIndex
CREATE INDEX "BusinessStory_musicId_idx" ON "BusinessStory"("musicId");

-- CreateIndex
CREATE INDEX "DriverLocation_driverId_updatedAt_idx" ON "DriverLocation"("driverId", "updatedAt");

-- CreateIndex
CREATE INDEX "OTPCode_phone_expiresAt_idx" ON "OTPCode"("phone", "expiresAt");

-- CreateIndex
CREATE INDEX "OTPCode_email_expiresAt_idx" ON "OTPCode"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "Post_musicId_idx" ON "Post"("musicId");

-- CreateIndex
CREATE INDEX "Ride_customerId_createdAt_idx" ON "Ride"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "Story_musicId_idx" ON "Story"("musicId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Story" ADD CONSTRAINT "Story_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Music" ADD CONSTRAINT "Music_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicFavorite" ADD CONSTRAINT "MusicFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MusicFavorite" ADD CONSTRAINT "MusicFavorite_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessPost" ADD CONSTRAINT "BusinessPost_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessStory" ADD CONSTRAINT "BusinessStory_musicId_fkey" FOREIGN KEY ("musicId") REFERENCES "Music"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ride" ADD CONSTRAINT "Ride_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTracking" ADD CONSTRAINT "OrderTracking_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderTrackingEvent" ADD CONSTRAINT "OrderTrackingEvent_trackingId_fkey" FOREIGN KEY ("trackingId") REFERENCES "OrderTracking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
