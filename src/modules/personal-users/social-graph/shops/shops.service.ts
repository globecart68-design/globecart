import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class ShopsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Favorite ─────────────────────────────────────────────────────────────

  async favoriteShop(userId: string, shopId: string) {
    const shop = await this.prisma.business.findUnique({
      where: { id: shopId },
      select: { id: true },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found.');
    }

    // Upsert — idempotent; double-tap from the client is a no-op
    await this.prisma.favoriteShop.upsert({
      where: { userId_shopId: { userId, shopId } },
      create: { userId, shopId },
      update: {},
    });

    return { message: 'Shop added to favorites.' };
  }

  async unfavoriteShop(userId: string, shopId: string) {
    const existing = await this.prisma.favoriteShop.findUnique({
      where: { userId_shopId: { userId, shopId } },
    });

    if (!existing) {
      throw new NotFoundException('Shop is not in your favorites.');
    }

    await this.prisma.favoriteShop.delete({
      where: { userId_shopId: { userId, shopId } },
    });

    return { message: 'Shop removed from favorites.' };
  }

  // ─── List favorites ───────────────────────────────────────────────────────

  async getFavoriteShops(userId: string) {
    const rows = await this.prisma.favoriteShop.findMany({
      where: { userId },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            businessType: true,
            description: true,
            location: true,
            profilePhoto: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => r.shop);
  }
}