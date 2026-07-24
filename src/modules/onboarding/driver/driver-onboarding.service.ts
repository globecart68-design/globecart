import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { RolesService } from '../../roles/roles.service';
import { ApplyAsDriverDto, ReviewDriverDto } from './dto/driver-onboarding.dto';

const DRIVER_ROLE = 'driver';

/**
 * Driver onboarding — two-step admin-gated flow:
 *
 *  1. User applies   → POST /onboarding/driver/apply
 *     Creates a DriverProfile with isActive: false (pending review).
 *
 *  2. Admin reviews  → PATCH /onboarding/driver/:driverId/review
 *     Approving sets isActive: true and calls RolesService.grantRole('driver').
 *     The user must then call POST /auth/switch-role { role: "driver" } to get
 *     a new token and start acting as a driver.
 *
 * The `driver` role is NEVER self-assigned — only admin approval grants it.
 */
@Injectable()
export class DriverOnboardingService {
  private readonly logger = new Logger(DriverOnboardingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roles: RolesService,
  ) {}

  // ─── Apply ─────────────────────────────────────────────────────────────────

  async apply(userId: string, dto: ApplyAsDriverDto) {
    const existing = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });

    if (existing) {
      if (existing.isActive) {
        throw new ConflictException('You already have an active driver profile.');
      }
      const updated = await this.prisma.driverProfile.update({
        where: { userId },
        data: {
          vehicleType: dto.vehicleType,
          licenseNumber: dto.licenseNumber,
        },
      });
      await this.commitActiveRole(userId);
      return updated;
    }

    const created = await this.prisma.driverProfile.create({
      data: {
        userId,
        vehicleType: dto.vehicleType,
        licenseNumber: dto.licenseNumber,
        isActive: false,
      },
    });
    await this.commitActiveRole(userId);
    return created;
  }

  // Submitting the application is what actually commits the earlier
  // `/auth/switch-role { role: "driver" }` call — see the matching note in
  // AuthService.switchRole(). Best-effort: a failure here shouldn't fail
  // the application submission itself.
  private async commitActiveRole(userId: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { lastActiveRole: DRIVER_ROLE },
      });
    } catch (err) {
      this.logger.warn(`Failed to commit lastActiveRole="driver" for user ${userId}: ${err}`);
    }
  }

  // ─── Get my application status ─────────────────────────────────────────────

  async getMyStatus(userId: string) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { userId },
    });
    if (!profile) return { status: 'not_applied' };
    return { status: profile.isActive ? 'approved' : 'pending_review', profile };
  }

  // ─── Admin: list pending applications ─────────────────────────────────────

  listPending() {
    return this.prisma.driverProfile.findMany({
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

  // ─── Admin: approve or reject ──────────────────────────────────────────────

  async review(driverId: string, dto: ReviewDriverDto) {
    const profile = await this.prisma.driverProfile.findUnique({
      where: { id: driverId },
    });

    if (!profile) throw new NotFoundException('Driver application not found.');
    if (profile.isActive) throw new ConflictException('This driver is already approved.');

    if (dto.decision === 'rejected') {
      if (!dto.reason) {
        throw new BadRequestException('A reason is required when rejecting an application.');
      }
      this.logger.log(`Driver application ${driverId} rejected. Reason: ${dto.reason}`);
      return { message: 'Application rejected.', reason: dto.reason };
    }

    // ── Approve ──────────────────────────────────────────────────────────────
    //
    // Ensure the "driver" role exists, then grant it via RolesService so all
    // role-management logic stays in one place.
    await this.prisma.$transaction(async (tx) => {
      await tx.driverProfile.update({
        where: { id: driverId },
        data: { isActive: true },
      });
    });

    // Grant role outside the transaction (RolesService handles its own upsert).
    await this.roles.grantRole(profile.userId, DRIVER_ROLE);

    this.logger.log(
      `Driver ${driverId} approved — role "${DRIVER_ROLE}" granted to user ${profile.userId}. ` +
        `User must call POST /auth/switch-role { role: "driver" } to activate it.`,
    );

    return {
      message: `Driver approved. User can now switch to the "${DRIVER_ROLE}" role via POST /auth/switch-role.`,
    };
  }
}
