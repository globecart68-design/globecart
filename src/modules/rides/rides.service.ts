import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RideStatus } from '@prisma/client';
import { MapsService } from '../maps/maps.service';
import { RedisService } from '../../redis/redis.service';
import { RidesRepository } from './rides.repository';
import { RequestRideDto } from './dto/request-ride.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';

/** Ride status transitions this service allows — anything else is rejected. */
const ALLOWED_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  requested: ['accepted', 'cancelled'],
  accepted: ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    private readonly rides: RidesRepository,
    private readonly maps: MapsService,
    private readonly redis: RedisService,
    private readonly events: EventEmitter2,
  ) {}

  // ── POST /rides/request ─────────────────────────────────────────────────
  async requestRide(customerId: string, dto: RequestRideDto) {
    const pickup = { lat: dto.pickupLat, lng: dto.pickupLng };
    const drop = { lat: dto.dropLat, lng: dto.dropLng };
    const estimate = this.maps.estimateFare(pickup, drop, dto.vehicleType);

    const ride = await this.rides.create({
      customerId,
      pickupLocation: dto.pickupLocation,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      dropLocation: dto.dropLocation,
      dropLat: dto.dropLat,
      dropLng: dto.dropLng,
      vehicleType: dto.vehicleType,
      fare: estimate.price,
      distanceKm: estimate.distanceKm,
      etaMinutes: estimate.etaMinutes,
      status: RideStatus.requested,
    });

    // Nearby drivers are notified over WS (see RealtimeGateway's
    // @OnEvent('ride.requested') handler); the Redis GEO lookup happens
    // here so the gateway doesn't need direct Prisma/geo knowledge.
    const nearbyDrivers = await this.redis
      .findNearbyDrivers(dto.pickupLat, dto.pickupLng, 5, 10)
      .catch((err) => {
        this.logger.warn(`Nearby driver lookup failed: ${err.message}`);
        return [];
      });

    this.events.emit('ride.requested', { ride, nearbyDrivers });
    return ride;
  }

  // ── GET /rides/:id ───────────────────────────────────────────────────────
  async findOne(userId: string, id: string) {
    const ride = await this._findOwnedRide(userId, id);
    return ride;
  }

  // ── GET /rides/history ────────────────────────────────────────────────────
  async history(userId: string, cursor?: string) {
    return this.rides.findHistoryForUser(userId, cursor);
  }

  // ── POST /rides/:id/cancel ────────────────────────────────────────────────
  async cancel(userId: string, id: string, dto: CancelRideDto) {
    const ride = await this._findOwnedRide(userId, id);
    this._assertTransition(ride.status, RideStatus.cancelled);

    const updated = await this.rides.updateStatus(id, RideStatus.cancelled, {
      cancelledAt: new Date(),
      cancelReason: dto.reason,
    });

    this.events.emit('ride.status_updated', { ride: updated });
    return updated;
  }

  // ── Driver-side actions (invoked from the WS gateway) ─────────────────────

  async acceptRide(driverUserId: string, rideId: string) {
    const driverProfile = await this.rides.findDriverProfileByUserId(driverUserId);
    if (!driverProfile) throw new ForbiddenException('Not a driver');

    const ride = await this.rides.findById(rideId);
    if (!ride) throw new NotFoundException('Ride not found');
    this._assertTransition(ride.status, RideStatus.accepted);
    if (ride.driverId) throw new BadRequestException('Ride already matched');

    const updated = await this.rides.assignDriver(rideId, driverProfile.id);
    this.events.emit('ride.status_updated', { ride: updated });
    return updated;
  }

  async updateStatus(driverUserId: string, rideId: string, status: RideStatus) {
    const driverProfile = await this.rides.findDriverProfileByUserId(driverUserId);
    if (!driverProfile) throw new ForbiddenException('Not a driver');

    const ride = await this.rides.findById(rideId);
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.driverId !== driverProfile.id) throw new ForbiddenException();
    this._assertTransition(ride.status, status);

    const timestampField =
      status === RideStatus.in_progress
        ? { startedAt: new Date() }
        : status === RideStatus.completed
          ? { completedAt: new Date() }
          : {};

    const updated = await this.rides.updateStatus(rideId, status, timestampField);
    this.events.emit('ride.status_updated', { ride: updated });
    return updated;
  }

  async updateDriverLocation(
    driverUserId: string,
    rideId: string,
    lat: number,
    lng: number,
  ) {
    const driverProfile = await this.rides.findDriverProfileByUserId(driverUserId);
    if (!driverProfile) throw new ForbiddenException('Not a driver');

    const ride = await this.rides.findById(rideId);
    if (!ride || ride.driverId !== driverProfile.id) throw new ForbiddenException();

    // Hot path: Redis first (what the gateway broadcasts from), Postgres
    // write is fire-and-forget history/audit — no one waits on it.
    await this.redis.setDriverLocation(driverProfile.id, lat, lng);
    this.rides
      .createDriverLocation(driverProfile.id, lat, lng)
      .catch((err) => this.logger.warn(`DriverLocation write failed: ${err.message}`));

    const destination =
      ride.status === RideStatus.accepted
        ? { lat: ride.pickupLat, lng: ride.pickupLng }
        : { lat: ride.dropLat, lng: ride.dropLng };
    const etaMinutes = this.maps.etaMinutes(
      this.maps.distanceKm({ lat, lng }, destination),
      ride.vehicleType,
    );

    this.events.emit('ride.location_updated', {
      rideId,
      driverId: driverProfile.id,
      lat,
      lng,
      etaMinutes,
    });

    return { rideId, lat, lng, etaMinutes };
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  async getDriverProfileIdForUser(userId: string): Promise<string | null> {
    const profile = await this.rides.findDriverProfileByUserId(userId);
    return profile?.id ?? null;
  }

  private async _findOwnedRide(userId: string, id: string) {
    const ride = await this.rides.findById(id);
    if (!ride) throw new NotFoundException('Ride not found');
    if (ride.customerId !== userId && ride.driver?.user.id !== userId) {
      throw new ForbiddenException();
    }
    return ride;
  }

  private _assertTransition(from: RideStatus, to: RideStatus) {
    if (!ALLOWED_TRANSITIONS[from]?.includes(to)) {
      throw new BadRequestException(`Cannot move ride from ${from} to ${to}`);
    }
  }
}
