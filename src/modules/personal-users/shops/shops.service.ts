import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

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

  // ─── Public feed ──────────────────────────────────────────────────────────

  async getAvailableShops() {
    const businesses = await this.prisma.business.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        businessType: true,
        location: true,
        profilePhoto: true,
        logoPhoto: true,
        createdAt: true,
        reviews: { select: { rating: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return businesses.map((b) => {
      const avgRating =
        b.reviews.length > 0
          ? b.reviews.reduce((sum, r) => sum + r.rating, 0) / b.reviews.length
          : 0.0;

      const logoUrl = b.logoPhoto ?? b.profilePhoto ?? '';

      return {
        id: b.id,
        name: b.name,
        category: b.businessType,
        rating: Math.round(avgRating * 10) / 10,
        reviewCount: b.reviews.length,
        distance: 0.0,
        isNew: this._isNew(b.createdAt),
        isFeatured: false,
        isOpen: true,
        openNow: true,
        imageUrl: logoUrl,
        logoPhoto: logoUrl,
        location: b.location ?? '',
      };
    });
  }

  private _isNew(createdAt: Date): boolean {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return createdAt > thirtyDaysAgo;
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

  // ─── Shop products (public view for a specific shop) ─────────────────────

  async getShopProducts(shopId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: shopId },
      select: {
        id: true,
        name: true,
        logoPhoto: true,
        profilePhoto: true,
        location: true,
      },
    });

    if (!business) throw new NotFoundException('Shop not found.');

    const products = await this.prisma.product.findMany({
      where: { businessId: shopId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: { images: true, variants: true },
    });

    return products.map((p) => ({
      id: p.id,
      shopId: business.id,
      shopName: business.name,
      shopAvatarUrl: business.logoPhoto ?? business.profilePhoto ?? '',
      description: p.description ?? p.name,
      price: p.price,
      currency: 'USD',
      imageUrls: (p.images ?? []).map((i) => i.url),
      likeCount: 0,
      commentCount: 0,
      shareCount: 0,
      isLiked: false,
      isSaved: false,
      location: business.location ?? '',
      variants: (p.variants ?? []).map((v) => v.name ?? ''),
    }));
  }
}