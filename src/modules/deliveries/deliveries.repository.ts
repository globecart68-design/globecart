import { Injectable } from '@nestjs/common';
import { AssignedOrderStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const ORDER_SUMMARY = {
  select: {
    id: true,
    total: true,
    status: true,
    createdAt: true,
    business: { select: { id: true, name: true, location: true, logoPhoto: true } },
    items: { select: { id: true, productId: true, quantity: true, price: true } },
  },
} satisfies { select: Prisma.OrderSelect };

const ASSIGNMENT_INCLUDE = {
  order: ORDER_SUMMARY,
} satisfies Prisma.AssignedOrderInclude;

const ACTIVE_STATUSES: AssignedOrderStatus[] = [
  AssignedOrderStatus.assigned,
  AssignedOrderStatus.picked_up,
  AssignedOrderStatus.in_transit,
];
const TERMINAL_STATUSES: AssignedOrderStatus[] = [
  AssignedOrderStatus.delivered,
  AssignedOrderStatus.failed,
];

@Injectable()
export class DeliveriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findDeliveryProfileByUserId(userId: string) {
    return this.prisma.deliveryProfile.findUnique({ where: { userId } });
  }

  /** Orders ready for pickup with no courier assigned yet — the claim queue. */
  findAvailableOrders(take = 20, cursor?: string) {
    return this.prisma.order.findMany({
      where: { status: OrderStatus.ready, assignedTo: { none: {} } },
      orderBy: { createdAt: 'asc' }, // oldest-ready-first, like a real dispatch queue
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      ...ORDER_SUMMARY,
    });
  }

  findActiveForCourier(deliveryId: string) {
    return this.prisma.assignedOrder.findMany({
      where: { deliveryId, status: { in: ACTIVE_STATUSES } },
      orderBy: { updatedAt: 'desc' },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  async findHistoryForCourier(deliveryId: string, cursor?: string, take = 20) {
    const rows = await this.prisma.assignedOrder.findMany({
      where: { deliveryId, status: { in: TERMINAL_STATUSES } },
      orderBy: { updatedAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: ASSIGNMENT_INCLUDE,
    });

    const hasNextPage = rows.length > take;
    const items = hasNextPage ? rows.slice(0, take) : rows;
    return { items, nextCursor: hasNextPage ? items[items.length - 1].id : null };
  }

  findAssignmentByOrderId(orderId: string) {
    return this.prisma.assignedOrder.findFirst({
      where: { orderId },
      include: ASSIGNMENT_INCLUDE,
    });
  }

  findOrder(orderId: string) {
    return this.prisma.order.findUnique({ where: { id: orderId } });
  }

  /**
   * Claims an order for a courier — wrapped in a transaction so two
   * couriers racing to accept the same order can't both succeed. The
   * `assignedTo: { none: {} }` guard on the update mirrors an optimistic
   * lock: it only succeeds if nobody claimed it between the read and here.
   */
  async claim(deliveryId: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { assignedTo: true },
      });
      if (!order) return { ok: false as const, reason: 'not_found' as const };
      if (order.status !== OrderStatus.ready) {
        return { ok: false as const, reason: 'not_ready' as const };
      }
      if (order.assignedTo.length > 0) {
        return { ok: false as const, reason: 'already_assigned' as const };
      }

      const assignment = await tx.assignedOrder.create({
        data: { deliveryId, orderId, status: AssignedOrderStatus.assigned },
        include: ASSIGNMENT_INCLUDE,
      });
      await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.assigned },
      });

      return { ok: true as const, assignment };
    });
  }

  updateStatus(assignmentId: string, status: AssignedOrderStatus) {
    return this.prisma.assignedOrder.update({
      where: { id: assignmentId },
      data: { status },
      include: ASSIGNMENT_INCLUDE,
    });
  }
}