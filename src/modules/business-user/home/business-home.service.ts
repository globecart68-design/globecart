import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  HomeDashboardDto,
  TodayOverviewDto,
  RecentOrderDto,
  BusinessInfoDto,
} from './dto/home-dashboard.dto';

@Injectable()
export class BusinessHomeService {
  private readonly logger = new Logger(BusinessHomeService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the full home dashboard payload for the owner's active business.
   *
   * Strategy:
   *  1. Resolve the owner's primary (most recent) business.
   *  2. Compute today's stats with a single aggregation query.
   *  3. Fetch the N most recent orders with customer display names.
   *
   * All three queries are fired in parallel via Promise.all to keep latency low.
   */
  async getDashboard(
    userId: string,
    limit: number = 10,
  ): Promise<HomeDashboardDto> {
    // ── 1. Resolve business ──────────────────────────────────────────────────
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        profilePhoto: true,
        logoPhoto: true,
        location: true,
        isActive: true,
      },
    });

    if (!business) {
      throw new NotFoundException(
        'No business found for this account. Please register a business first.',
      );
    }

    const clampedLimit = Math.min(Math.max(limit, 1), 50);

    // ── 2 & 3. Parallel queries ──────────────────────────────────────────────
    const [todayOverview, recentOrders] = await Promise.all([
      this._getTodayOverview(business.id),
      this._getRecentOrders(business.id, clampedLimit),
    ]);

    return {
      business: business as BusinessInfoDto,
      today: todayOverview,
      recentOrders,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private async _getTodayOverview(businessId: string): Promise<TodayOverviewDto> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    // One aggregate query for revenue + count
    const [aggregate, returnCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          businessId,
          status: {
            notIn: ['cancelled', 'refunded'],
          },
          createdAt: {
            gte: startOfDay,
            lte: endOfDay,
          },
        },
        _sum: { total: true },
        _count: { id: true },
      }),
      this.prisma.order.count({
        where: {
          businessId,
          status: 'refunded',
          createdAt: { gte: startOfDay, lte: endOfDay },
        },
      }),
    ]);

    const orderCount = aggregate._count.id;
    const revenue = aggregate._sum.total ?? 0;
    const avgOrderValue = orderCount > 0 ? revenue / orderCount : 0;

    return {
      revenue,
      orderCount,
      avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
      returnCount,
    };
  }

  private async _getRecentOrders(
    businessId: string,
    limit: number,
  ): Promise<RecentOrderDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        total: true,
        status: true,
        createdAt: true,
        customer: {
          select: {
            profile: {
              select: { username: true },
            },
            phone: true,
            email: true,
          },
        },
        _count: {
          select: { items: true },
        },
      },
    });

    return orders.map((order, index) => {
      // Derive a human-readable customer label — username preferred, then
      // masked phone/email, then a generic fallback.
      const customerName =
        order.customer.profile?.username ??
        this._maskIdentifier(order.customer.phone ?? order.customer.email) ??
        'Guest';

      return {
        id: order.id,
        orderNumber: this._shortId(order.id, index),
        customerName,
        itemCount: order._count.items,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      };
    });
  }

  /** Produces a short display reference like "#1A2B" from a UUID. */
  private _shortId(uuid: string, fallbackIndex: number): string {
    const suffix = uuid.replace(/-/g, '').slice(0, 4).toUpperCase();
    return suffix.length === 4 ? `#${suffix}` : `#${String(fallbackIndex + 1001)}`;
  }

  /** Masks a phone or email for privacy, e.g. "+234***1234" or "jo***@ex.com". */
  private _maskIdentifier(value: string | null | undefined): string | null {
    if (!value) return null;
    if (value.includes('@')) {
      const [local, domain] = value.split('@');
      return `${local.slice(0, 2)}***@${domain}`;
    }
    return `${value.slice(0, 4)}***${value.slice(-4)}`;
  }
}
