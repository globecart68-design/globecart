import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TrackingStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MapsService } from '../maps/maps.service';
import { RedisService } from '../../redis/redis.service';
import { TrackingRepository } from './tracking.repository';

/** Mirrors the Flutter TrackingTimeline's step order exactly. */
const TIMELINE_ORDER: TrackingStatus[] = [
  TrackingStatus.order_confirmed,
  TrackingStatus.preparing,
  TrackingStatus.picked_up,
  TrackingStatus.on_the_way,
  TrackingStatus.delivered,
];

@Injectable()
export class TrackingService {
  private readonly logger = new Logger(TrackingService.name);

  constructor(
    private readonly tracking: TrackingRepository,
    private readonly prisma: PrismaService,
    private readonly maps: MapsService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  // ── GET /orders/:id/tracking ────────────────────────────────────────────
  async getForOrder(userId: string, orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, customerId: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    const tracking = (await this.tracking.findByOrderId(orderId)) ??
      (await this.tracking.ensureForOrder(orderId));

    const assignedDeliveryUserId =
      tracking.order.assignedTo[0]?.delivery.user.id ?? null;

    if (order.customerId !== userId && assignedDeliveryUserId !== userId) {
      throw new ForbiddenException();
    }

    return tracking;
  }

  // ── Delivery-courier actions (invoked from the WS gateway) ────────────────

  async updateStatus(
    courierUserId: string,
    orderId: string,
    status: TrackingStatus,
    note?: string,
  ) {
    await this._assertAssigned(courierUserId, orderId);

    const current = await this.tracking.findByOrderId(orderId);
    if (!current) throw new NotFoundException('Tracking not started for this order');
    this._assertForwardOnly(current.status, status);

    const tracking = await this.tracking.setStatus(orderId, status, note);
    this.events.emit('order_tracking.status_updated', { orderId, tracking });
    return tracking;
  }

  async updateDriverLocation(
    courierUserId: string,
    orderId: string,
    lat: number,
    lng: number,
    destination?: { lat: number; lng: number },
  ) {
    const deliveryProfile = await this._assertAssigned(courierUserId, orderId);

    await this.redis.setDriverLocation(deliveryProfile.id, lat, lng);
    this.tracking
      .createDeliveryLocation(deliveryProfile.id, lat, lng)
      .catch((err) =>
        this.logger.warn(`DeliveryLocation write failed: ${err.message}`),
      );

    const etaMinutes = destination
      ? this.maps.etaMinutes(this.maps.distanceKm({ lat, lng }, destination))
      : undefined;

    const tracking = await this.tracking.updateDriverPosition(
      orderId,
      lat,
      lng,
      etaMinutes,
    );

    this.events.emit('order_tracking.location_updated', {
      orderId,
      lat,
      lng,
      etaMinutes: tracking.etaMinutes,
    });

    return tracking;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private async _assertAssigned(courierUserId: string, orderId: string) {
    const deliveryProfile =
      await this.tracking.findDeliveryProfileByUserId(courierUserId);
    if (!deliveryProfile) throw new ForbiddenException('Not a delivery courier');

    const assigned = await this.tracking.isAssignedToOrder(deliveryProfile.id, orderId);
    if (!assigned) throw new ForbiddenException('Not assigned to this order');

    return deliveryProfile;
  }

  /** Timeline only ever moves forward — no skipping back to "preparing" after "on_the_way". */
  private _assertForwardOnly(current: TrackingStatus, next: TrackingStatus) {
    const currentIndex = TIMELINE_ORDER.indexOf(current);
    const nextIndex = TIMELINE_ORDER.indexOf(next);
    if (nextIndex === -1) {
      throw new ForbiddenException(`Unknown tracking status: ${next}`);
    }
    if (nextIndex <= currentIndex) {
      throw new ForbiddenException(
        `Cannot move tracking status from ${current} to ${next}`,
      );
    }
  }
}
