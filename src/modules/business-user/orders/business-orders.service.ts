import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  GetOrdersQuery,
  appStatusToDbFilter,
  dbStatusToApp,
  APP_ORDER_STATUSES,
  AppOrderStatus,
} from './dto/orders.dto';

/** Merchant-driven forward transitions, keyed by current DB status. */
const BUSINESS_FORWARD_TRANSITIONS: Record<string, string> = {
  confirmed: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
};

const ORDER_INCLUDE = {
  customer: {
    select: {
      id: true,
      phone: true,
      email: true,
      profile: { select: { username: true, profilePhoto: true } },
    },
  },
  items: {
    select: {
      id: true,
      quantity: true,
      price: true,
      product: { select: { name: true, imageUrl: true } },
    },
  },
} satisfies Prisma.OrderInclude;

type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

@Injectable()
export class BusinessOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private async _resolveBusinessId(userId: string): Promise<string> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!business) {
      throw new NotFoundException('No business found for this account.');
    }
    return business.id;
  }

  async listOrders(userId: string, query: GetOrdersQuery) {
    const businessId = await this._resolveBusinessId(userId);

    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 50);

    const where: Prisma.OrderWhereInput = { businessId };

    if (query.status) {
      where.status = { in: appStatusToDbFilter(query.status) as OrderStatus[] };
    }

    if (query.from || query.to) {
      where.createdAt = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }

    if (query.search && query.search.trim().length > 0) {
      const term = query.search.trim();
      where.OR = [
        { id: { contains: term, mode: 'insensitive' } },
        { customer: { phone: { contains: term, mode: 'insensitive' } } },
        { customer: { email: { contains: term, mode: 'insensitive' } } },
        {
          customer: {
            profile: { username: { contains: term, mode: 'insensitive' } },
          },
        },
      ];
    }

    // paymentMethod / fulfillmentType filters are accepted but not yet
    // applied — see GetOrdersQuery for why.

    const orderBy: Prisma.OrderOrderByWithRelationInput =
      query.sort === 'oldest'
        ? { createdAt: 'asc' }
        : query.sort === 'amount_high'
          ? { total: 'desc' }
          : query.sort === 'amount_low'
            ? { total: 'asc' }
            : { createdAt: 'desc' };

    const [rows, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit + 1, // fetch one extra to cheaply know hasMore
        include: ORDER_INCLUDE,
      }),
      this.prisma.order.count({ where }),
    ]);

    const hasMore = rows.length > limit;
    const data = rows.slice(0, limit).map((o) => this._toDto(o));

    return { data, hasMore, total };
  }

  async getStatusCounts(userId: string): Promise<Record<AppOrderStatus, number>> {
    const businessId = await this._resolveBusinessId(userId);

    const groups = await this.prisma.order.groupBy({
      by: ['status'],
      where: { businessId },
      _count: { id: true },
    });

    const counts = Object.fromEntries(
      APP_ORDER_STATUSES.map((s) => [s, 0]),
    ) as Record<AppOrderStatus, number>;

    for (const g of groups) {
      const appStatus = dbStatusToApp(g.status);
      counts[appStatus] += g._count.id;
    }

    return counts;
  }

  async getOrder(userId: string, orderId: string) {
    const businessId = await this._resolveBusinessId(userId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException('Order not found.');
    return this._toDto(order);
  }

  async acceptOrder(userId: string, orderId: string) {
    const businessId = await this._resolveBusinessId(userId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (order.status !== 'pending') {
      throw new BadRequestException(
        `Cannot accept an order in "${order.status}" status.`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'confirmed' as OrderStatus },
      include: ORDER_INCLUDE,
    });
    return this._toDto(updated);
  }

  async rejectOrder(userId: string, orderId: string, _reason?: string) {
    const businessId = await this._resolveBusinessId(userId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (!['pending', 'confirmed'].includes(order.status)) {
      throw new BadRequestException(
        `Cannot reject an order in "${order.status}" status.`,
      );
    }

    // Note: there's no column to persist a rejection reason yet, so
    // `_reason` is accepted for API compatibility but not stored.
    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'cancelled' as OrderStatus },
      include: ORDER_INCLUDE,
    });
    return this._toDto(updated);
  }

  async updateStatus(userId: string, orderId: string, targetAppStatus: string) {
    const businessId = await this._resolveBusinessId(userId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, businessId },
    });
    if (!order) throw new NotFoundException('Order not found.');

    const nextDbStatus = BUSINESS_FORWARD_TRANSITIONS[order.status];
    const targetDbStatus = appStatusToDbFilter(targetAppStatus)[0];

    if (!nextDbStatus || nextDbStatus !== targetDbStatus) {
      throw new BadRequestException(
        `Cannot move an order from "${order.status}" to "${targetAppStatus}".`,
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: nextDbStatus as OrderStatus },
      include: ORDER_INCLUDE,
    });
    return this._toDto(updated);
  }

  // ─── Mapping ────────────────────────────────────────────────────────────────

  /** Produces a short display reference like "#1A2B" from a UUID. */
  private _shortId(uuid: string): string {
    const suffix = uuid.replace(/-/g, '').slice(0, 4).toUpperCase();
    return `#${suffix}`;
  }

  private _toDto(order: OrderWithRelations) {
    const customerName =
      order.customer.profile?.username ??
      (order.customer.email
        ? order.customer.email.split('@')[0]
        : order.customer.phone?.slice(-4)) ??
      'Guest';

    return {
      id: order.id,
      orderNumber: this._shortId(order.id),
      customer: {
        id: order.customer.id,
        name: customerName,
        avatarUrl: order.customer.profile?.profilePhoto ?? null,
        phone: order.customer.phone,
      },
      createdAt: order.createdAt.toISOString(),
      status: dbStatusToApp(order.status),
      // The schema tracks only a single `total` per order — there's no
      // subtotal/discount/tax/deliveryFee breakdown, so subtotal mirrors
      // total and the rest are 0 rather than fabricated.
      subtotal: order.total,
      discount: 0,
      tax: 0,
      deliveryFee: 0,
      total: order.total,
      items: order.items.map((item) => ({
        id: item.id,
        name: item.product?.name ?? 'Item',
        quantity: item.quantity,
        price: item.price,
        imageUrl: item.product?.imageUrl ?? null,
      })),
      // paymentMethod/paymentStatus/fulfillmentType/deliveryAddress/driver/
      // timeline aren't backed by any column or relation currently wired
      // up elsewhere in this codebase — omitted rather than fabricated.
      // The Flutter model already defaults these gracefully when absent.
    };
  }
}
