import { Injectable } from '@nestjs/common';
import { Prisma, TrackingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const TRACKING_INCLUDE = {
  events: { orderBy: { createdAt: 'asc' } },
  order: {
    select: {
      id: true,
      customerId: true,
      status: true,
      assignedTo: {
        orderBy: { updatedAt: 'desc' },
        take: 1,
        select: {
          status: true,
          delivery: {
            select: {
              id: true,
              vehicleType: true,
              user: {
                select: {
                  id: true,
                  phone: true,
                  profile: { select: { username: true, profilePhoto: true } },
                },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.OrderTrackingInclude;

@Injectable()
export class TrackingRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByOrderId(orderId: string) {
    return this.prisma.orderTracking.findUnique({
      where: { orderId },
      include: TRACKING_INCLUDE,
    });
  }

  /** Creates the OrderTracking row + its first timeline event, idempotently. */
  async ensureForOrder(orderId: string) {
    return this.prisma.orderTracking.upsert({
      where: { orderId },
      update: {},
      create: {
        orderId,
        status: TrackingStatus.order_confirmed,
        events: { create: { status: TrackingStatus.order_confirmed } },
      },
      include: TRACKING_INCLUDE,
    });
  }

  async setStatus(orderId: string, status: TrackingStatus, note?: string) {
    return this.prisma.orderTracking.update({
      where: { orderId },
      data: {
        status,
        events: { create: { status, note } },
      },
      include: TRACKING_INCLUDE,
    });
  }

  updateDriverPosition(orderId: string, lat: number, lng: number, etaMinutes?: number) {
    return this.prisma.orderTracking.update({
      where: { orderId },
      data: { driverLat: lat, driverLng: lng, etaMinutes },
      include: TRACKING_INCLUDE,
    });
  }

  findDeliveryProfileByUserId(userId: string) {
    return this.prisma.deliveryProfile.findUnique({ where: { userId } });
  }

  createDeliveryLocation(deliveryId: string, lat: number, lng: number) {
    return this.prisma.deliveryLocation.create({
      data: { deliveryId, latitude: lat, longitude: lng },
    });
  }

  /** True if this delivery profile is currently assigned to this order. */
  isAssignedToOrder(deliveryId: string, orderId: string) {
    return this.prisma.assignedOrder
      .findFirst({ where: { deliveryId, orderId } })
      .then(Boolean);
  }
}
