import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RolesService } from '../../roles/roles.service';
import { StorageService } from '../../storage/storage.service';
import { RegisterBusinessDto, UpdateBusinessDto } from './dto/business-onboarding.dto';

const BUSINESS_ROLE = 'business';

@Injectable()
export class BusinessOnboardingService {
  private readonly logger = new Logger(BusinessOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly roles: RolesService,
  ) {}

  // ─── Register ──────────────────────────────────────────────────────────────

  /**
   * Creates a new Business row and grants the caller the `business` role.
   * Business registration is self-serve (unlike driver/delivery which require
   * admin approval), so the role is granted immediately.
   *
   * The user must then call POST /auth/switch-role { role: "business" } to get
   * a token that reflects the new role.
   */
  async register(userId: string, dto: RegisterBusinessDto) {
    const business = await this.prisma.business.create({
      data: {
        ownerId: userId,
        name: dto.name,
        businessType: dto.businessType,
        description: dto.description,
        location: dto.location,
        // isActive defaults to false — owner must explicitly publish
      },
    });

    // Grant role via RolesService (handles upsert + role-not-found gracefully).
    try {
      await this.roles.grantRole(userId, BUSINESS_ROLE);
    } catch (err) {
      this.logger.warn(
        `Role "${BUSINESS_ROLE}" could not be granted to user ${userId}: ${err}. ` +
          `Business created but role skipped — ensure the role is seeded.`,
      );
    }

    return business;
  }

  // ─── Get my shops ──────────────────────────────────────────────────────────

  getMyBusinesses(userId: string) {
    return this.prisma.business.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyBusiness(businessId: string, userId: string) {
    return this.assertOwner(businessId, userId);
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  async update(businessId: string, userId: string, dto: UpdateBusinessDto) {
    await this.assertOwner(businessId, userId);
    return this.prisma.business.update({
      where: { id: businessId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.location !== undefined && { location: dto.location }),
      },
    });
  }

  // ─── Upload logo ───────────────────────────────────────────────────────────

  async uploadLogo(businessId: string, userId: string, file: Express.Multer.File) {
    const business = await this.assertOwner(businessId, userId);

    if (business.profilePhoto) {
      await this.storage
        .deleteAvatar(business.profilePhoto)
        .catch((err) => this.logger.warn(`Failed to delete old business logo: ${err.message}`));
    }

    const profilePhoto = await this.storage.uploadAvatar(file);
    return this.prisma.business.update({ where: { id: businessId }, data: { profilePhoto } });
  }

  // ─── Publish ───────────────────────────────────────────────────────────────

  async publish(businessId: string, userId: string) {
    const business = await this.assertOwner(businessId, userId);
    if (business.isActive) throw new ConflictException('This shop is already published.');

    const productCount = await this.prisma.product.count({ where: { businessId } });
    if (productCount === 0) {
      throw new ConflictException('Add at least one product before publishing your shop.');
    }

    return this.prisma.business.update({ where: { id: businessId }, data: { isActive: true } });
  }

  // ─── Unpublish ─────────────────────────────────────────────────────────────

  async unpublish(businessId: string, userId: string) {
    await this.assertOwner(businessId, userId);
    return this.prisma.business.update({ where: { id: businessId }, data: { isActive: false } });
  }

  // ─── Ownership guard ───────────────────────────────────────────────────────

  async assertOwner(businessId: string, userId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== userId) throw new ForbiddenException('You do not own this business.');
    return business;
  }
}
