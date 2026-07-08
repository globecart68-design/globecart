import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  CustomerFilter,
  CustomerSummaryDto,
  CustomerDto,
  CustomersPageDto,
} from './dto/customers.dto';

const REGULAR_THRESHOLD = 3; // orders to be considered "regular"

@Injectable()
export class BusinessCustomersService {
  private readonly logger = new Logger(BusinessCustomersService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCustomers(
    userId: string,
    filter: CustomerFilter,
    search: string | undefined,
    page: number,
    limit: number,
  ): Promise<CustomersPageDto> {
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

    // ── Summary (always computed for all customers) ──────────────────────────
    const summary = await this._getSummary(business.id);

    // ── Customer aggregation ─────────────────────────────────────────────────
    // Group orders by customerId to get per-customer stats
    const groups = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { businessId: business.id },
      _count: { id: true },
      _sum: { total: true },
      _max: { createdAt: true },
    });

    // Apply REGULAR / NEW filters
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    let filtered = groups;

    if (filter === CustomerFilter.REGULAR) {
      filtered = groups.filter((g) => g._count.id >= REGULAR_THRESHOLD);
    } else if (filter === CustomerFilter.NEW) {
      filtered = groups.filter(
        (g) => g._max.createdAt && g._max.createdAt >= weekAgo,
      );
    }

    // ── Fetch user profiles for display names & avatars ──────────────────────
    const customerIds = filtered.map((g) => g.customerId);

    const users = await this.prisma.user.findMany({
      where: {
        id: { in: customerIds },
        // Optional search: match on username or handle
        ...(search && search.trim().length > 0
          ? {
              OR: [
                {
                  profile: {
                    username: { contains: search.trim(), mode: 'insensitive' },
                  },
                },
                {
                  profile: {
                    handle: { contains: search.trim(), mode: 'insensitive' },
                  },
                },
                { phone: { contains: search.trim() } },
                { email: { contains: search.trim(), mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        phone: true,
        email: true,
        profile: { select: { username: true, profilePhoto: true } },
      },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    // Re-filter to only customers matching the search
    const searchFiltered =
      search && search.trim().length > 0
        ? filtered.filter((g) => userMap.has(g.customerId))
        : filtered;

    // Sort by total spent descending
    searchFiltered.sort(
      (a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0),
    );

    const total = searchFiltered.length;
    const totalPages = Math.ceil(total / clampedLimit) || 1;
    const paged = searchFiltered.slice(offset, offset + clampedLimit);

    const customers: CustomerDto[] = paged.map((g) => {
      const user = userMap.get(g.customerId);
      const displayName =
        user?.profile?.username ??
        user?.email?.split('@')[0] ??
        user?.phone?.slice(-4) ??
        'Guest';

      return {
        id: g.customerId,
        displayName,
        avatarUrl: user?.profile?.profilePhoto ?? null,
        orderCount: g._count.id,
        totalSpent: parseFloat((g._sum.total ?? 0).toFixed(2)),
        lastOrderAt: g._max.createdAt ?? null,
        isRegular: g._count.id >= REGULAR_THRESHOLD,
      };
    });

    return {
      summary,
      customers,
      total,
      page,
      totalPages,
    };
  }

  private async _getSummary(businessId: string): Promise<CustomerSummaryDto> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const groups = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: { businessId },
      _count: { id: true },
      _max: { createdAt: true },
    });

    const totalCustomers = groups.length;
    const regularCustomers = groups.filter(
      (g) => g._count.id >= REGULAR_THRESHOLD,
    ).length;
    const newThisWeek = groups.filter(
      (g) => g._max.createdAt && g._max.createdAt >= weekAgo,
    ).length;

    return { totalCustomers, regularCustomers, newThisWeek };
  }
}