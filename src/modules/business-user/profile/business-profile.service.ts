import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { BusinessProfileDto, UpdateBusinessProfileDto } from './dto/business-profile-dto';

@Injectable()
export class BusinessProfileService {
  private readonly logger = new Logger(BusinessProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Fetches the authenticated owner's primary business profile with
   * aggregated lifetime stats (orders, revenue, customers, rating, followers)
   * and operating hours. All counts are fetched in parallel to keep latency minimal.
   */
  async getProfile(userId: string): Promise<BusinessProfileDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        businessType: true,
        description: true,
        location: true,
        profilePhoto: true,
        logoPhoto: true,
        bannerPhoto: true,
        isActive: true,
        createdAt: true,
        minOrderAmount: true,
      },
    });

    if (!business) {
      throw new NotFoundException(
        'No business found. Please register a business first.',
      );
    }

    const [orderAgg, uniqueCustomers, ratingAgg, followerCount, operatingHours] =
      await Promise.all([
        // Total orders + revenue (exclude cancelled/refunded from revenue)
        this.prisma.order.aggregate({
          where: { businessId: business.id },
          _count: { id: true },
          _sum: { total: true },
        }),

        // Unique customers (distinct customerId)
        this.prisma.order
          .findMany({
            where: { businessId: business.id },
            select: { customerId: true },
            distinct: ['customerId'],
          })
          .then((rows) => rows.length),

        // Reviews: avg rating + count
        this.prisma.review.aggregate({
          where: { storeId: business.id },
          _avg: { rating: true },
          _count: { id: true },
        }),

        // Followers of the business owner (proxy for shop followers)
        this.prisma.follow.count({
          where: { followingId: userId },
        }),

        // Operating hours for each day
        this.prisma.operatingHours.findMany({
          where: { businessId: business.id },
          orderBy: { dayOfWeek: 'asc' },
          select: {
            id: true,
            dayOfWeek: true,
            isOpen: true,
            openTime: true,
            closeTime: true,
          },
        }),
      ]);

    return {
      ...business,
      stats: {
        totalOrders: orderAgg._count.id,
        totalRevenue: orderAgg._sum.total ?? 0,
        totalCustomers: uniqueCustomers,
        averageRating: parseFloat(
          (ratingAgg._avg.rating ?? 0).toFixed(1),
        ),
        reviewCount: ratingAgg._count.id,
        followerCount,
      },
      operatingHours,
    };
  }

  /**
   * Updates the authenticated owner's business profile (name, description, location).
   */
  async updateProfile(
    userId: string,
    dto: UpdateBusinessProfileDto,
  ): Promise<BusinessProfileDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user.');
    }

    // Update the business profile
    await this.prisma.business.update({
      where: { id: business.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.businessType !== undefined && { businessType: dto.businessType }),
        ...(dto.minOrderAmount !== undefined && { minOrderAmount: dto.minOrderAmount }),
      },
    });

    // Return updated profile with stats
    return this.getProfile(userId);
  }

  /**
   * Uploads a banner/profile photo for the business.
   * If previous banner exists, it will be deleted from storage.
   */
  async uploadBannerPhoto(
    userId: string,
    file: Express.Multer.File,
  ): Promise<BusinessProfileDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user.');
    }

    // Upload new banner
    const bannerUrl = await this.storage.uploadAvatar(file);

    // Delete old banner if exists
    if (business.bannerPhoto) {
      try {
        await this.storage.deleteFile(business.bannerPhoto);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to delete old banner: ${message}`);
      }
    }

    // Update business with new banner URL
    await this.prisma.business.update({
      where: { id: business.id },
      data: { bannerPhoto: bannerUrl },
    });

    // Return updated profile with stats
    return this.getProfile(userId);
  }

  /**
   * Uploads a logo/icon photo for the business.
   * If previous logo exists, it will be deleted from storage.
   */
  async uploadLogoPhoto(
    userId: string,
    file: Express.Multer.File,
  ): Promise<BusinessProfileDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user.');
    }

    // Upload new logo
    const logoUrl = await this.storage.uploadAvatar(file);

    // Delete old logo if exists
    if (business.logoPhoto) {
      try {
        await this.storage.deleteFile(business.logoPhoto);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to delete old logo: ${message}`);
      }
    }

    // Update business with new logo URL
    await this.prisma.business.update({
      where: { id: business.id },
      data: { logoPhoto: logoUrl },
    });

    // Return updated profile with stats
    return this.getProfile(userId);
  }
}