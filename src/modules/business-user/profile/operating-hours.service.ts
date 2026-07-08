import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateOperatingHoursDto, UpdateOperatingHoursDto, OperatingHourResponseDto } from './dto/operating-hours.dto';

@Injectable()
export class OperatingHoursService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all operating hours for a business.
   */
  async getOperatingHours(userId: string): Promise<OperatingHourResponseDto[]> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user.');
    }

    return this.prisma.operatingHours.findMany({
      where: { businessId: business.id },
      orderBy: { dayOfWeek: 'asc' },
      select: {
        id: true,
        dayOfWeek: true,
        isOpen: true,
        openTime: true,
        closeTime: true,
      },
    });
  }

  /**
   * Set or update operating hours for a specific day.
   */
  async setOperatingHours(
    userId: string,
    dto: CreateOperatingHoursDto,
  ): Promise<OperatingHourResponseDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user.');
    }

    // Upsert to create or update
    const result = await this.prisma.operatingHours.upsert({
      where: {
        businessId_dayOfWeek: {
          businessId: business.id,
          dayOfWeek: dto.dayOfWeek,
        },
      },
      create: {
        businessId: business.id,
        dayOfWeek: dto.dayOfWeek,
        isOpen: dto.isOpen ?? true,
        openTime: dto.openTime,
        closeTime: dto.closeTime,
      },
      update: {
        isOpen: dto.isOpen ?? true,
        openTime: dto.openTime,
        closeTime: dto.closeTime,
      },
      select: {
        id: true,
        dayOfWeek: true,
        isOpen: true,
        openTime: true,
        closeTime: true,
      },
    });

    return result;
  }

  /**
   * Update operating hours for a specific day.
   */
  async updateOperatingHours(
    userId: string,
    dayOfWeek: number,
    dto: UpdateOperatingHoursDto,
  ): Promise<OperatingHourResponseDto> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user.');
    }

    const hours = await this.prisma.operatingHours.findUnique({
      where: {
        businessId_dayOfWeek: {
          businessId: business.id,
          dayOfWeek,
        },
      },
    });

    if (!hours) {
      throw new NotFoundException(
        `Operating hours not found for day ${dayOfWeek}`,
      );
    }

    const result = await this.prisma.operatingHours.update({
      where: {
        businessId_dayOfWeek: {
          businessId: business.id,
          dayOfWeek,
        },
      },
      data: {
        ...(dto.isOpen !== undefined && { isOpen: dto.isOpen }),
        ...(dto.openTime !== undefined && { openTime: dto.openTime }),
        ...(dto.closeTime !== undefined && { closeTime: dto.closeTime }),
      },
      select: {
        id: true,
        dayOfWeek: true,
        isOpen: true,
        openTime: true,
        closeTime: true,
      },
    });

    return result;
  }

  /**
   * Initialize default operating hours for a business (all days open 09:00-18:00).
   */
  async initializeDefaultHours(businessId: string): Promise<void> {
    const defaultHours = Array.from({ length: 7 }, (_, i) => ({
      businessId,
      dayOfWeek: i,
      isOpen: true,
      openTime: '09:00',
      closeTime: '18:00',
    }));

    await this.prisma.operatingHours.createMany({
      data: defaultHours,
      skipDuplicates: true,
    });
  }

  /**
   * Delete operating hours for a specific day.
   */
  async deleteOperatingHours(userId: string, dayOfWeek: number): Promise<void> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!business) {
      throw new NotFoundException('No business found for this user.');
    }

    const hours = await this.prisma.operatingHours.findUnique({
      where: {
        businessId_dayOfWeek: {
          businessId: business.id,
          dayOfWeek,
        },
      },
    });

    if (!hours) {
      throw new NotFoundException(
        `Operating hours not found for day ${dayOfWeek}`,
      );
    }

    await this.prisma.operatingHours.delete({
      where: {
        businessId_dayOfWeek: {
          businessId: business.id,
          dayOfWeek,
        },
      },
    });
  }
}
