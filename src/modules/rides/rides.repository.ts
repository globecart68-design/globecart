import { Injectable } from '@nestjs/common';
import { Prisma, RideStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const RIDE_INCLUDE = {
  driver: {
    select: {
      id: true,
      vehicleType: true,
      user: {
        select: {
          id: true,
          phone: true,
          profile: { select: { username: true, profilePhoto: true } },
        },
      },
    },
  },
} satisfies Prisma.RideInclude;

@Injectable()
export class RidesRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.RideUncheckedCreateInput) {
    return this.prisma.ride.create({ data, include: RIDE_INCLUDE });
  }

  findById(id: string) {
    return this.prisma.ride.findUnique({ where: { id }, include: RIDE_INCLUDE });
  }

  async findHistoryForUser(userId: string, cursor?: string, take = 20) {
    const rides = await this.prisma.ride.findMany({
      where: { customerId: userId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: RIDE_INCLUDE,
    });

    const hasNextPage = rides.length > take;
    const items = hasNextPage ? rides.slice(0, take) : rides;
    return { items, nextCursor: hasNextPage ? items[items.length - 1].id : null };
  }

  updateStatus(
    id: string,
    status: RideStatus,
    extra: Prisma.RideUncheckedUpdateInput = {},
  ) {
    return this.prisma.ride.update({
      where: { id },
      data: { status, ...extra },
      include: RIDE_INCLUDE,
    });
  }

  assignDriver(id: string, driverId: string) {
    return this.prisma.ride.update({
      where: { id },
      data: { driverId, status: RideStatus.accepted, acceptedAt: new Date() },
      include: RIDE_INCLUDE,
    });
  }

  /** DriverProfile.id for a given User.id — rides key off the profile, sockets key off the user. */
  findDriverProfileByUserId(userId: string) {
    return this.prisma.driverProfile.findUnique({ where: { userId } });
  }

  createDriverLocation(driverId: string, lat: number, lng: number) {
    return this.prisma.driverLocation.create({
      data: { driverId, latitude: lat, longitude: lng },
    });
  }
}
