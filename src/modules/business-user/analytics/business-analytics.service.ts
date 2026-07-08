import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OrderStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  AnalyticsPeriod,
  AnalyticsDto,
  AnalyticsStatsDto,
  ChartPointDto,
  TopProductDto,
} from './dto/analytics.dto';

interface DateRange {
  gte: Date;
  lte: Date;
}

@Injectable()
export class BusinessAnalyticsService {
  private readonly logger = new Logger(BusinessAnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getAnalytics(
    userId: string,
    period: AnalyticsPeriod,
  ): Promise<AnalyticsDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!business) {
      throw new NotFoundException('No business found for this account.');
    }

    const current = this._dateRange(period);
    const previous = this._previousRange(period, current);

    const [stats, chart, topProducts] = await Promise.all([
      this._getStats(business.id, current, previous),
      this._getChart(business.id, current, period),
      this._getTopProducts(business.id, current),
    ]);

    return { period, stats, chart, topProducts };
  }

  // ─── Stats ──────────────────────────────────────────────────────────────────

  private async _getStats(
    businessId: string,
    current: DateRange,
    previous: DateRange,
  ): Promise<AnalyticsStatsDto> {
    const delivered = { notIn: ['cancelled', 'refunded'] as OrderStatus[] };

    const [curAgg, prevAgg, curReturns, prevReturns, curNew, prevNew] =
      await Promise.all([
        this.prisma.order.aggregate({
          where: {
            businessId,
            status: delivered,
            createdAt: current,
          },
          _sum: { total: true },
          _count: { _all: true },
        }),
        this.prisma.order.aggregate({
          where: {
            businessId,
            status: delivered,
            createdAt: previous,
          },
          _sum: { total: true },
          _count: { _all: true },
        }),
        this.prisma.order.count({
          where: { businessId, status: 'refunded', createdAt: current },
        }),
        this.prisma.order.count({
          where: { businessId, status: 'refunded', createdAt: previous },
        }),
        // New customers = first-time buyers in period
        this._newCustomers(businessId, current),
        this._newCustomers(businessId, previous),
      ]);

    const curRevenue = curAgg._sum.total ?? 0;
    const prevRevenue = prevAgg._sum.total ?? 0;
    const curOrders = curAgg._count._all;
    const prevOrders = prevAgg._count._all;
    const curAvg = curOrders > 0 ? curRevenue / curOrders : 0;
    const prevAvg = prevOrders > 0 ? prevRevenue / prevOrders : 0;

    return {
      totalRevenue: curRevenue,
      revenueChange: this._pctChange(prevRevenue, curRevenue),
      totalOrders: curOrders,
      ordersChange: this._pctChange(prevOrders, curOrders),
      avgOrderValue: parseFloat(curAvg.toFixed(2)),
      avgOrderChange: this._pctChange(prevAvg, curAvg),
      newCustomers: curNew,
      newCustomersChange: this._pctChange(prevNew, curNew),
      returnCount: curReturns,
      returnsChange: this._pctChange(prevReturns, curReturns),
    };
  }

  // ─── Chart ──────────────────────────────────────────────────────────────────

  private async _getChart(
    businessId: string,
    range: DateRange,
    period: AnalyticsPeriod,
  ): Promise<ChartPointDto[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        businessId,
        status: { notIn: ['cancelled', 'refunded'] as OrderStatus[] },
        createdAt: range,
      },
      select: { total: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const buckets = this._buildBuckets(period, range);

    for (const order of orders) {
      const key = this._bucketKey(order.createdAt, period);
      const bucket = buckets.find((b) => b.label === key);
      if (bucket) bucket.revenue += order.total;
    }

    return buckets.map((b) => ({
      label: b.label,
      revenue: parseFloat(b.revenue.toFixed(2)),
    }));
  }

  private _buildBuckets(
    period: AnalyticsPeriod,
    range: DateRange,
  ): { label: string; revenue: number }[] {
    const buckets: { label: string; revenue: number }[] = [];

    if (period === AnalyticsPeriod.TODAY) {
      // 6am, 9am, 12pm, 3pm, 6pm, 9pm, now
      const hours = [6, 9, 12, 15, 18, 21];
      for (const h of hours) {
        buckets.push({ label: this._hourLabel(h), revenue: 0 });
      }
      buckets.push({ label: 'Now', revenue: 0 });
    } else if (period === AnalyticsPeriod.WEEK) {
      const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      for (const d of days) buckets.push({ label: d, revenue: 0 });
    } else {
      // Month: W1–W5
      for (let w = 1; w <= 5; w++) buckets.push({ label: `W${w}`, revenue: 0 });
    }

    return buckets;
  }

  private _bucketKey(date: Date, period: AnalyticsPeriod): string {
    if (period === AnalyticsPeriod.TODAY) {
      const hour = date.getHours();
      if (hour < 9) return this._hourLabel(6);
      if (hour < 12) return this._hourLabel(9);
      if (hour < 15) return this._hourLabel(12);
      if (hour < 18) return this._hourLabel(15);
      if (hour < 21) return this._hourLabel(18);
      return this._hourLabel(21);
    }
    if (period === AnalyticsPeriod.WEEK) {
      return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][
        (date.getDay() + 6) % 7
      ];
    }
    const weekOfMonth = Math.ceil(date.getDate() / 7);
    return `W${Math.min(weekOfMonth, 5)}`;
  }

  private _hourLabel(h: number): string {
    if (h === 12) return '12pm';
    return h < 12 ? `${h}am` : `${h - 12}pm`;
  }

  // ─── Top products ────────────────────────────────────────────────────────────

  private async _getTopProducts(
    businessId: string,
    range: DateRange,
    limit = 5,
  ): Promise<TopProductDto[]> {
    const items = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: {
        order: {
          businessId,
          createdAt: range,
          status: { notIn: ['cancelled', 'refunded'] as OrderStatus[] },
        },
      },
      _sum: { quantity: true, price: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    if (items.length === 0) return [];

    const productIds = items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, category: true },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    return items.map((item) => {
      const product = productMap.get(item.productId);
      return {
        id: item.productId,
        name: product?.name ?? 'Unknown Product',
        category: product?.category ?? '—',
        salesCount: item._sum.quantity ?? 0,
        revenue: parseFloat((item._sum.price ?? 0).toFixed(2)),
      };
    });
  }

  // ─── New customers helper ────────────────────────────────────────────────────

  private async _newCustomers(
    businessId: string,
    range: DateRange,
  ): Promise<number> {
    // A "new customer" is someone whose FIRST order with this business falls
    // within the given range. We use a subquery approach: find customers who
    // placed their first-ever order in the range.
    const firstOrders = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { businessId },
      _min: { createdAt: true },
    });

    return firstOrders.filter(
      (row) =>
        row._min.createdAt &&
        row._min.createdAt >= range.gte &&
        row._min.createdAt <= range.lte,
    ).length;
  }

  // ─── Date helpers ────────────────────────────────────────────────────────────

  private _dateRange(period: AnalyticsPeriod): DateRange {
    const now = new Date();

    if (period === AnalyticsPeriod.TODAY) {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      const end = new Date(now);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    }

    if (period === AnalyticsPeriod.WEEK) {
      const day = now.getDay(); // 0=Sun
      const diff = (day + 6) % 7; // days since Monday
      const start = new Date(now);
      start.setDate(now.getDate() - diff);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return { gte: start, lte: end };
    }

    // MONTH
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    return { gte: start, lte: end };
  }

  private _previousRange(period: AnalyticsPeriod, current: DateRange): DateRange {
    const duration = current.lte.getTime() - current.gte.getTime();
    return {
      gte: new Date(current.gte.getTime() - duration - 1),
      lte: new Date(current.gte.getTime() - 1),
    };
  }

  private _pctChange(prev: number, cur: number): number {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return parseFloat((((cur - prev) / prev) * 100).toFixed(1));
  }
}