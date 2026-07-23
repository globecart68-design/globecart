import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AssignedOrderStatus, TrackingStatus } from '@prisma/client';
import { DeliveriesRepository } from './deliveries.repository';
import { TrackingService } from '../tracking/tracking.service';
import { TrackingRepository } from '../tracking/tracking.repository';

/** Courier-driven transitions. `failed` is reachable from any non-terminal state. */
const FORWARD_TRANSITIONS: Record<AssignedOrderStatus, AssignedOrderStatus[]> = {
  assigned: [AssignedOrderStatus.picked_up, AssignedOrderStatus.failed],
  picked_up: [AssignedOrderStatus.in_transit, AssignedOrderStatus.failed],
  in_transit: [AssignedOrderStatus.delivered, AssignedOrderStatus.failed],
  delivered: [],
  failed: [],
};

/** Mirrors a courier's AssignedOrder status onto the customer-facing tracking timeline. */
const TRACKING_MIRROR: Partial<Record<AssignedOrderStatus, TrackingStatus>> = {
  picked_up: TrackingStatus.picked_up,
  in_transit: TrackingStatus.on_the_way,
  delivered: TrackingStatus.delivered,
};

@Injectable()
export class DeliveriesService {
  private readonly logger = new Logger(DeliveriesService.name);

  constructor(
    private readonly deliveries: DeliveriesRepository,
    private readonly tracking: TrackingRepository,
    private readonly trackingService: TrackingService,
    private readonly events: EventEmitter2,
  ) {}

  // ── GET /deliveries/available ─────────────────────────────────────────
  findAvailable(cursor?: string) {
    return this.deliveries.findAvailableOrders(20, cursor);
  }

  // ── GET /deliveries/assigned ──────────────────────────────────────────
  async findAssigned(courierUserId: string) {
    const profile = await this._requireDeliveryProfile(courierUserId);
    return this.deliveries.findActiveForCourier(profile.id);
  }

  // ── GET /deliveries/history ───────────────────────────────────────────
  async history(courierUserId: string, cursor?: string) {
    const profile = await this._requireDeliveryProfile(courierUserId);
    return this.deliveries.findHistoryForCourier(profile.id, cursor);
  }

  // ── POST /deliveries/:orderId/accept ──────────────────────────────────
  async accept(courierUserId: string, orderId: string) {
    const profile = await this._requireDeliveryProfile(courierUserId);

    const result = await this.deliveries.claim(profile.id, orderId);
    if (!result.ok) {
      const messages = {
        not_found: 'Order not found',
        not_ready: 'Order is not ready for pickup',
        already_assigned: 'Order was already claimed by another courier',
      };
      throw new BadRequestException(messages[result.reason]);
    }

    // Order-confirmed/preparing tracking events happen upstream (business
    // side) before an order is ever ready for pickup; this just guarantees
    // the tracking row exists by the time the customer opens Track mode,
    // even if that upstream step hasn't been wired up yet.
    await this.tracking.ensureForOrder(orderId);

    this.events.emit('delivery.assigned', { assignment: result.assignment });
    return result.assignment;
  }

  // ── Courier status updates (invoked from REST or the WS gateway) ───────
  async updateStatus(
    courierUserId: string,
    orderId: string,
    status: AssignedOrderStatus,
    note?: string,
  ) {
    const profile = await this._requireDeliveryProfile(courierUserId);

    const assignment = await this.deliveries.findAssignmentByOrderId(orderId);
    if (!assignment) throw new NotFoundException('No assignment found for this order');
    if (assignment.deliveryId !== profile.id) throw new ForbiddenException();

    if (!FORWARD_TRANSITIONS[assignment.status]?.includes(status)) {
      throw new BadRequestException(
        `Cannot move delivery from ${assignment.status} to ${status}`,
      );
    }

    const updated = await this.deliveries.updateStatus(assignment.id, status);

    // Mirror onto the customer-facing timeline — reuses TrackingService's
    // own forward-only check and WS broadcast, so this is the single path
    // that ever touches OrderTracking.
    const mirroredStatus = TRACKING_MIRROR[status];
    if (mirroredStatus) {
      try {
        await this.trackingService.updateStatus(courierUserId, orderId, mirroredStatus, note);
      } catch (err) {
        // Don't fail the courier's action over a tracking-mirror hiccup —
        // log it and let the AssignedOrder update stand.
        this.logger.warn(`Tracking mirror failed for order ${orderId}: ${(err as Error).message}`);
      }
    }

    if (status === AssignedOrderStatus.failed) {
      this.events.emit('delivery.failed', { orderId, assignmentId: assignment.id, note });
    }

    return updated;
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private async _requireDeliveryProfile(userId: string) {
    const profile = await this.deliveries.findDeliveryProfileByUserId(userId);
    if (!profile) throw new ForbiddenException('Not a delivery courier');
    return profile;
  }
}
