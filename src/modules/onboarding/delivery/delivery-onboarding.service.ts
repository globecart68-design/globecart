import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RolesService } from '../../roles/roles.service';
import { ApplyAsDeliveryDto, ReviewDeliveryDto } from './dto/delivery-onboarding.dto';

const DELIVERY_ROLE = 'delivery';

@Injectable()
export class DeliveryOnboardingService {
  private readonly logger = new Logger(DeliveryOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  // ─── Apply as Delivery Rider ─────────────────────────────────────────────────

  async apply(userId: string, dto: ApplyAsDeliveryDto) {
    const existing = await this.prisma.deliveryProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('You already have an active delivery profile.');
      }

      // Update pending application
      return this.prisma.deliveryProfile.update({
        where: { userId },
        data: {
          vehicleType: dto.vehicleType,
          licenseNumber: dto.licenseNumber,
        },
      });
    }

    const profile = await this.prisma.deliveryProfile.create({
      data: {
        userId,
        vehicleType: dto.vehicleType,
        licenseNumber: dto.licenseNumber,
        isActive: false, // Requires admin approval
      },
    });

    this.logger.log(`New delivery application submitted by user ${userId}`);
    return profile;
  }

  // ─── Get Application Status ──────────────────────────────────────────────────

  async getMyStatus(userId: string) {
    const profile = await this.prisma.deliveryProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return { status: 'not_applied' as const };
    }

    return {
      status: profile.isActive ? 'approved' : 'pending_review',
      profile,
    };
  }

  // ─── Admin: List Pending Applications ───────────────────────────────────────

  listPending() {
    return this.prisma.deliveryProfile.findMany({
      where: { isActive: false },
      include: {
        user: {
          select: {
            id: true,
            phone: true,
            email: true,
            profile: {
              select: { username: true, handle: true, profilePhoto: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  // ─── Admin: Review Application ───────────────────────────────────────────────

  async review(deliveryId: string, dto: ReviewDeliveryDto) {
    const profile = await this.prisma.deliveryProfile.findUnique({
      where: { id: deliveryId },
      include: { user: true },
    });

    if (!profile) throw new NotFoundException('Delivery application not found.');
    if (profile.isActive) throw new ConflictException('This delivery rider is already approved.');

    if (dto.decision === 'rejected') {
      if (!dto.reason) {
        throw new BadRequestException('A reason is required when rejecting an application.');
      }

      this.logger.log(`Delivery application ${deliveryId} rejected. Reason: ${dto.reason}`);

      return {
        message: 'Application rejected.',
        reason: dto.reason,
      };
    }

    // Approve
    await this.prisma.deliveryProfile.update({
      where: { id: deliveryId },
      data: { isActive: true },
    });

    // Grant delivery role only after approval
    try {
      await this.roles.grantRole(profile.userId, DELIVERY_ROLE);
      this.logger.log(`Delivery rider ${deliveryId} approved — role "${DELIVERY_ROLE}" granted to user ${profile.userId}`);
    } catch (err) {
      this.logger.warn(`Failed to grant delivery role to user ${profile.userId}: ${err}`);
    }

    return {
      message: `Delivery rider approved successfully. User can now switch to the "${DELIVERY_ROLE}" role.`,
    };
  }
}