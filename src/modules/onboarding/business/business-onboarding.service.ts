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

  // ─── Auto-create default business (called after signup if initialRole = business) ───

  /**
   * Creates a default Business record for new users who selected "business" role.
   * Idempotent — safe to call multiple times.
   */
  async createDefault(userId: string) {
    const existing = await this.prisma.business.findFirst({
      where: { ownerId: userId },
    });
    if (existing) return existing;

    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const defaultName = `My Shop · ${suffix}`;

    const business = await this.prisma.business.create({
      data: {
        ownerId: userId,
        name: defaultName,
        businessType: 'other',
        // isActive defaults to false — owner must publish manually
      },
    });

    // Initialize default operating hours for all 7 days (9:00 AM - 6:00 PM)
    const defaultHours = Array.from({ length: 7 }, (_, i) => ({
      businessId: business.id,
      dayOfWeek: i,
      isOpen: true,
      openTime: '09:00',
      closeTime: '18:00',
    }));

    await this.prisma.operatingHours.createMany({
      data: defaultHours,
      skipDuplicates: true,
    });

    this.logger.log(`Auto-created default business "${defaultName}" for user ${userId}`);

    return business;
  }

  // ─── Register Full Business ───────────────────────────────────────────────────

  /**
   * Full business registration (self-serve).
   * The `business` role should already be granted via initialRole during signup.
   * This method focuses only on creating/updating the business profile.
   */
  async register(userId: string, dto: RegisterBusinessDto) {
    // Check if business already exists
    const existing = await this.prisma.business.findFirst({
      where: { ownerId: userId },
    });

    if (existing) {
      // Update existing instead of creating duplicate
      const updated = await this.prisma.business.update({
        where: { id: existing.id },
        data: {
          name: dto.name,
          businessType: dto.businessType,
          description: dto.description,
          location: dto.location,
        },
      });
      await this.commitActiveRole(userId);
      return updated;
    }

    const business = await this.prisma.business.create({
      data: {
        ownerId: userId,
        name: dto.name,
        businessType: dto.businessType,
        description: dto.description,
        location: dto.location,
      },
    });

    // Initialize default operating hours for all 7 days (9:00 AM - 6:00 PM)
    const defaultHours = Array.from({ length: 7 }, (_, i) => ({
      businessId: business.id,
      dayOfWeek: i,
      isOpen: true,
      openTime: '09:00',
      closeTime: '18:00',
    }));

    await this.prisma.operatingHours.createMany({
      data: defaultHours,
      skipDuplicates: true,
    });

    await this.commitActiveRole(userId);

    this.logger.log(`Business registered for user ${userId}: ${dto.name}`);

    return business;
  }

  // Submitting the shop setup form is what actually commits the earlier
  // `/auth/switch-role { role: "business" }` call — see the matching note
  // in AuthService.switchRole(). Best-effort: a failure here shouldn't
  // fail the business registration itself.
  private async commitActiveRole(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveRole: BUSINESS_ROLE },
      });
    } catch (err) {
      this.logger.warn(`Failed to commit lastActiveRole="business" for user ${userId}: ${err}`);
    }
  }

  // ─── Get My Businesses ────────────────────────────────────────────────────────

  getMyBusinesses(userId: string) {
    return this.prisma.business.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getMyBusiness(businessId: string, userId: string) {
    return this.assertOwner(businessId, userId);
  }

  // ─── Update ───────────────────────────────────────────────────────────────────

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

  // ─── Upload Logo ──────────────────────────────────────────────────────────────

  async uploadLogo(businessId: string, userId: string, file: Express.Multer.File) {
    const business = await this.assertOwner(businessId, userId);

    if (business.profilePhoto) {
      await this.storage
        .deleteAvatar(business.profilePhoto)
        .catch((err) => this.logger.warn(`Failed to delete old logo: ${err.message}`));
    }

    const profilePhoto = await this.storage.uploadAvatar(file);

    return this.prisma.business.update({
      where: { id: businessId },
      data: { profilePhoto },
    });
  }

  // ─── Publish / Unpublish ──────────────────────────────────────────────────────

  async publish(businessId: string, userId: string) {
    const business = await this.assertOwner(businessId, userId);
    if (business.isActive) throw new ConflictException('Shop is already published.');

    const productCount = await this.prisma.product.count({ where: { businessId } });
    if (productCount === 0) {
      throw new ConflictException('Add at least one product before publishing.');
    }

    return this.prisma.business.update({
      where: { id: businessId },
      data: { isActive: true },
    });
  }

  async unpublish(businessId: string, userId: string) {
    await this.assertOwner(businessId, userId);
    return this.prisma.business.update({
      where: { id: businessId },
      data: { isActive: false },
    });
  }

  // ─── Ownership Guard ──────────────────────────────────────────────────────────

  private async assertOwner(businessId: string, userId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) throw new NotFoundException('Business not found.');
    if (business.ownerId !== userId) throw new ForbiddenException('You do not own this business.');

    return business;
  }
}