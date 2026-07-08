import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  PaymentTab,
  PaymentBalanceDto,
  TransactionDto,
  PayoutDto,
  InvoiceDto,
  PaymentsPageDto,
} from './dto/payments.dto';

@Injectable()
export class BusinessPaymentsService {
  private readonly logger = new Logger(BusinessPaymentsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPayments(
    userId: string,
    tab: PaymentTab,
    page: number,
    limit: number,
  ): Promise<PaymentsPageDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!business) {
      throw new NotFoundException('No business found for this account.');
    }

    const clampedLimit = Math.min(Math.max(limit, 1), 50);
    const offset = (Math.max(page, 1) - 1) * clampedLimit;

    // Balance is always computed regardless of tab
    const balance = await this._getBalance(business.id);

    let items: TransactionDto[] | PayoutDto[] | InvoiceDto[];
    let total: number;

    if (tab === PaymentTab.TRANSACTIONS) {
      ({ items, total } = await this._getTransactions(
        business.id,
        offset,
        clampedLimit,
      ));
    } else if (tab === PaymentTab.PAYOUTS) {
      ({ items, total } = await this._getPayouts(
        business.id,
        offset,
        clampedLimit,
      ));
    } else {
      ({ items, total } = await this._getInvoices(
        business.id,
        offset,
        clampedLimit,
      ));
    }

    return {
      balance,
      items,
      total,
      page,
      totalPages: Math.ceil(total / clampedLimit) || 1,
    };
  }

  // ─── Balance ────────────────────────────────────────────────────────────────

  private async _getBalance(businessId: string): Promise<PaymentBalanceDto> {
    const [deliveredAgg, pendingAgg, refundedAgg] = await Promise.all([
      this.prisma.order.aggregate({
        where: { businessId, status: 'delivered' },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: {
          businessId,
          status: { in: ['confirmed', 'preparing', 'ready', 'assigned', 'in_transit'] },
        },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: { businessId, status: 'refunded' },
        _sum: { total: true },
      }),
    ]);

    const totalEarned = deliveredAgg._sum.total ?? 0;
    const refunded = refundedAgg._sum.total ?? 0;
    // Available = delivered revenue minus refunds (simplified — no payout model in schema)
    const availableBalance = Math.max(totalEarned - refunded, 0);
    const pendingBalance = pendingAgg._sum.total ?? 0;

    return {
      availableBalance: parseFloat(availableBalance.toFixed(2)),
      pendingBalance: parseFloat(pendingBalance.toFixed(2)),
      totalEarned: parseFloat(totalEarned.toFixed(2)),
    };
  }

  // ─── Transactions ────────────────────────────────────────────────────────────

  private async _getTransactions(
    businessId: string,
    skip: number,
    take: number,
  ): Promise<{ items: TransactionDto[]; total: number }> {
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          businessId,
          status: { notIn: ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'in_transit'] },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          total: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.order.count({
        where: {
          businessId,
          status: { notIn: ['pending', 'confirmed', 'preparing', 'ready', 'assigned', 'in_transit'] },
        },
      }),
    ]);

    const items: TransactionDto[] = orders.map((o, index) => {
      const isRefund = o.status === 'refunded';
      const shortRef = o.id.replace(/-/g, '').slice(0, 4).toUpperCase();
      return {
        id: o.id,
        type: isRefund ? 'refund' : 'order_payment',
        orderId: o.id,
        orderNumber: `#${shortRef}`,
        amount: parseFloat(o.total.toFixed(2)),
        isCredit: !isRefund,
        createdAt: o.createdAt,
      };
    });

    return { items, total };
  }

  // ─── Payouts ──────────────────────────────────────────────────────────────────
  // Note: No Payout model exists in the schema yet. We synthesise weekly
  // payout records from delivered order batches so the UI has real data to show.
  // When a real Payout table is added, swap this implementation.

  private async _getPayouts(
    businessId: string,
    skip: number,
    take: number,
  ): Promise<{ items: PayoutDto[]; total: number }> {
    // Build synthetic weekly payout buckets from delivered orders
    const orders = await this.prisma.order.findMany({
      where: { businessId, status: 'delivered' },
      orderBy: { createdAt: 'desc' },
      select: { total: true, createdAt: true },
    });

    // Group by ISO week
    const weekMap = new Map<string, { total: number; date: Date }>();
    for (const o of orders) {
      const key = this._isoWeekKey(o.createdAt);
      const existing = weekMap.get(key);
      if (existing) {
        existing.total += o.total;
      } else {
        weekMap.set(key, { total: o.total, date: o.createdAt });
      }
    }

    const weeks = [...weekMap.entries()].sort((a, b) =>
      b[1].date.getTime() - a[1].date.getTime(),
    );

    const total = weeks.length;
    const paged = weeks.slice(skip, skip + take);

    const now = new Date();
    const items: PayoutDto[] = paged.map(([key, week], i) => ({
      id: `payout_${key}`,
      amount: parseFloat(week.total.toFixed(2)),
      // Mark as pending if within the current week
      status:
        key === this._isoWeekKey(now) ? 'pending' : 'completed',
      createdAt: week.date,
    }));

    return { items, total };
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────────

  private async _getInvoices(
    businessId: string,
    skip: number,
    take: number,
  ): Promise<{ items: InvoiceDto[]; total: number }> {
    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where: {
          businessId,
          status: { notIn: ['cancelled'] },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        select: {
          id: true,
          total: true,
          createdAt: true,
          customer: {
            select: {
              profile: { select: { username: true } },
              email: true,
              phone: true,
            },
          },
        },
      }),
      this.prisma.order.count({
        where: {
          businessId,
          status: { notIn: ['cancelled'] },
        },
      }),
    ]);

    const items: InvoiceDto[] = orders.map((o) => {
      const shortRef = o.id.replace(/-/g, '').slice(0, 7).toUpperCase();
      const customerName =
        o.customer.profile?.username ??
        o.customer.email?.split('@')[0] ??
        o.customer.phone?.slice(-4) ??
        'Guest';

      return {
        id: o.id,
        invoiceNumber: `INV-${shortRef}`,
        customerName,
        amount: parseFloat(o.total.toFixed(2)),
        createdAt: o.createdAt,
      };
    });

    return { items, total };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private _isoWeekKey(date: Date): string {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
    const week1 = new Date(d.getFullYear(), 0, 4);
    const weekNum =
      1 +
      Math.round(
        ((d.getTime() - week1.getTime()) / 86400000 -
          3 +
          ((week1.getDay() + 6) % 7)) /
          7,
      );
    return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
  }
}