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

  async apply(userId: string, dto: ApplyAsDeliveryDto) {
    const existing = await this.prisma.deliveryProfile.findUnique({ where: { userId } });

    if (existing) {
      if (existing.isActive) throw new ConflictException('You already have an active delivery profile.');
      return this.prisma.deliveryProfile.update({
        where: { userId },
        data: { vehicleType: dto.vehicleType, licenseNumber: dto.licenseNumber },
      });
    }

    return this.prisma.deliveryProfile.create({
      data: { userId, vehicleType: dto.vehicleType, licenseNumber: dto.licenseNumber, isActive: false },
    });
  }

  async getMyStatus(userId: string) {
    const profile = await this.prisma.deliveryProfile.findUnique({ where: { userId } });
    if (!profile) return { status: 'not_applied' };
    return { status: profile.isActive ? 'approved' : 'pending_review', profile };
  }

  listPending() {
    return this.prisma.deliveryProfile.findMany({
      where: { isActive: false },
      include: {
        user: {
          select: {
            id: true, phone: true, email: true,
            profile: { select: { username: true, handle: true, profilePhoto: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async review(deliveryId: string, dto: ReviewDeliveryDto) {
    const profile = await this.prisma.deliveryProfile.findUnique({ where: { id: deliveryId } });
    if (!profile) throw new NotFoundException('Delivery application not found.');
    if (profile.isActive) throw new ConflictException('This delivery rider is already approved.');

    if (dto.decision === 'rejected') {
      if (!dto.reason) throw new BadRequestException('A reason is required when rejecting an application.');
      this.logger.log(`Delivery application ${deliveryId} rejected. Reason: ${dto.reason}`);
      return { message: 'Application rejected.', reason: dto.reason };
    }

    await this.prisma.deliveryProfile.update({ where: { id: deliveryId }, data: { isActive: true } });
    await this.roles.grantRole(profile.userId, DELIVERY_ROLE);

    this.logger.log(`Delivery rider ${deliveryId} approved — role "${DELIVERY_ROLE}" granted.`);
    return {
      message: `Delivery rider approved. User can now switch to the "${DELIVERY_ROLE}" role via POST /auth/switch-role.`,
    };
  }
}
