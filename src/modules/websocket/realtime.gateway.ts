import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { UsePipes, ValidationPipe, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { RideStatus, TrackingStatus } from '@prisma/client';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { WsAuthService } from './ws-auth.service';
import { RidesService } from '../rides/rides.service';
import { TrackingService } from '../tracking/tracking.service';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { RedisService } from '../../redis/redis.service';
import {
  CourierOrderLocationDto,
  CourierOrderStatusDto,
  DriverRideAcceptDto,
  DriverRideLocationDto,
  DriverRideStatusDto,
  SubscribeOrderDto,
  SubscribeRideDto,
} from './dto/ws-payloads.dto';

type AuthedSocket = Socket & { data: { user: AuthenticatedUser } };

const rideRoom = (rideId: string) => `ride:${rideId}`;
const orderRoom = (orderId: string) => `order:${orderId}`;
const driverRoom = (driverProfileId: string) => `driver:${driverProfileId}`;

/**
 * Single gateway for every Map Hub real-time event. Namespaced at
 * `/realtime` so it doesn't collide with any other Socket.IO usage this app
 * adds later.
 *
 * Auth: the HTTP JwtAuthGuard doesn't run for WS connections, so
 * `handleConnection` verifies the token itself (see WsAuthService) and
 * disconnects anyone who fails.
 *
 * Rooms: clients ask to join `ride:{id}` / `order:{id}` via the
 * `subscribe:ride` / `subscribe:order` messages below — ownership is
 * checked before the join, the same way the REST GET endpoints check it.
 */
@WebSocketGateway({
  namespace: '/realtime',
  cors: { origin: process.env.CORS_ORIGIN ?? '*', credentials: true },
})
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);

  constructor(
    private readonly wsAuth: WsAuthService,
    private readonly ridesService: RidesService,
    private readonly trackingService: TrackingService,
    private readonly deliveriesService: DeliveriesService,
    private readonly redis: RedisService,
  ) {}

  afterInit(server: Server) {
    // Redis pub/sub adapter — required for driver_location_updated etc. to
    // reach every subscriber once this runs on more than one instance.
    //
    // Because this gateway declares `namespace: '/realtime'`, Nest hands us
    // the Namespace instance here (io.of('/realtime')), not the root
    // Socket.IO Server. `.adapter()` as a *method* only exists on the root
    // Server — on a Namespace it's just a plain property holding the
    // already-attached adapter, so calling it throws "server.adapter is
    // not a function". Namespace instances expose the root Server back via
    // `.server`, and calling `.adapter()` there re-initialises adapters on
    // every namespace already created (including this one), so this still
    // takes effect immediately.
    const rootServer: Server = (server as any).server ?? server;
    rootServer.adapter(createAdapter(this.redis.pub, this.redis.sub));
  }

  async handleConnection(client: Socket) {
    const user = await this.wsAuth.authenticate(client);
    if (!user) {
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
      return;
    }
    (client as AuthedSocket).data.user = user;
    client.join(`user:${user.id}`);

    if (user.activeRole === 'driver') {
      const driverProfileId = await this.ridesService.getDriverProfileIdForUser(user.id);
      if (driverProfileId) client.join(driverRoom(driverProfileId));
    }

    this.logger.debug(`Client connected: ${user.id} (${user.activeRole})`);
  }

  handleDisconnect(client: Socket) {
    const user = (client as AuthedSocket).data?.user;
    if (user) this.logger.debug(`Client disconnected: ${user.id}`);
  }

  // ── Subscriptions (customer + driver/courier apps both use these) ───────

  @SubscribeMessage('subscribe:ride')
  async onSubscribeRide(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: SubscribeRideDto,
  ) {
    // Throws ForbiddenException/NotFoundException if the caller doesn't
    // own this ride — Nest's WS exception filter turns that into an
    // `exception` event on the socket.
    await this.ridesService.findOne(client.data.user.id, dto.rideId);
    client.join(rideRoom(dto.rideId));
    return { subscribed: dto.rideId };
  }

  @SubscribeMessage('subscribe:order')
  async onSubscribeOrder(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: SubscribeOrderDto,
  ) {
    const tracking = await this.trackingService.getForOrder(
      client.data.user.id,
      dto.orderId,
    );
    client.join(orderRoom(dto.orderId));
    return tracking;
  }

  // ── Inbound: ride-hailing driver app ─────────────────────────────────────

  @SubscribeMessage('driver:ride:accept')
  async onDriverAcceptRide(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: DriverRideAcceptDto,
  ) {
    this._assertRole(client, 'driver');
    return this.ridesService.acceptRide(client.data.user.id, dto.rideId);
  }

  @SubscribeMessage('driver:ride:location')
  async onDriverRideLocation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: DriverRideLocationDto,
  ) {
    this._assertRole(client, 'driver');
    return this.ridesService.updateDriverLocation(
      client.data.user.id,
      dto.rideId,
      dto.lat,
      dto.lng,
    );
  }

  @SubscribeMessage('driver:ride:status')
  async onDriverRideStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: DriverRideStatusDto,
  ) {
    this._assertRole(client, 'driver');
    return this.ridesService.updateStatus(
      client.data.user.id,
      dto.rideId,
      dto.status as RideStatus,
    );
  }

  // ── Inbound: delivery courier app ────────────────────────────────────────

  @SubscribeMessage('delivery:order:location')
  async onCourierOrderLocation(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: CourierOrderLocationDto,
  ) {
    this._assertRole(client, 'delivery');
    const destination =
      dto.destinationLat != null && dto.destinationLng != null
        ? { lat: dto.destinationLat, lng: dto.destinationLng }
        : undefined;
    return this.trackingService.updateDriverLocation(
      client.data.user.id,
      dto.orderId,
      dto.lat,
      dto.lng,
      destination,
    );
  }

  @SubscribeMessage('delivery:order:status')
  async onCourierOrderStatus(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: CourierOrderStatusDto,
  ) {
    this._assertRole(client, 'delivery');
    return this.deliveriesService.updateStatus(
      client.data.user.id,
      dto.orderId,
      dto.status,
      dto.note,
    );
  }

  // ── Outbound broadcasts — domain events in, the 4 spec'd WS events out ──

  @OnEvent('ride.requested')
  onRideRequested({
    ride,
    nearbyDrivers,
  }: {
    ride: { id: string; pickupLocation: string; dropLocation: string; fare: number };
    nearbyDrivers: Array<{ driverId: string; distanceKm: number }>;
  }) {
    // Supplementary to the 4 required events — this is what lets a driver
    // app know a ride exists to accept in the first place.
    for (const { driverId, distanceKm } of nearbyDrivers) {
      this.server.to(driverRoom(driverId)).emit('ride_requested', {
        rideId: ride.id,
        pickupLocation: ride.pickupLocation,
        dropLocation: ride.dropLocation,
        fare: ride.fare,
        distanceKm,
      });
    }
  }

  @OnEvent('ride.status_updated')
  onRideStatusUpdated({ ride }: { ride: { id: string; status: RideStatus } }) {
    this.server.to(rideRoom(ride.id)).emit('ride_status_updated', {
      rideId: ride.id,
      status: ride.status,
      ride,
    });
  }

  @OnEvent('ride.location_updated')
  onRideLocationUpdated(payload: {
    rideId: string;
    driverId: string;
    lat: number;
    lng: number;
    etaMinutes: number;
  }) {
    const room = rideRoom(payload.rideId);
    this.server.to(room).emit('driver_location_updated', {
      rideId: payload.rideId,
      lat: payload.lat,
      lng: payload.lng,
      updatedAt: new Date().toISOString(),
    });
    this.server.to(room).emit('ride_location_updated', {
      rideId: payload.rideId,
      driverLat: payload.lat,
      driverLng: payload.lng,
      etaMinutes: payload.etaMinutes,
    });
  }

  @OnEvent('order_tracking.status_updated')
  onOrderStatusUpdated({
    orderId,
    tracking,
  }: {
    orderId: string;
    tracking: { status: TrackingStatus };
  }) {
    this.server.to(orderRoom(orderId)).emit('order_status_updated', {
      orderId,
      status: tracking.status,
      tracking,
    });
  }

  @OnEvent('order_tracking.location_updated')
  onOrderLocationUpdated(payload: {
    orderId: string;
    lat: number;
    lng: number;
    etaMinutes: number | null;
  }) {
    this.server.to(orderRoom(payload.orderId)).emit('driver_location_updated', {
      orderId: payload.orderId,
      lat: payload.lat,
      lng: payload.lng,
      etaMinutes: payload.etaMinutes,
      updatedAt: new Date().toISOString(),
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private _assertRole(client: AuthedSocket, role: 'driver' | 'delivery') {
    if (client.data.user.activeRole !== role) {
      throw new Error(`This action requires the "${role}" active role`);
    }
  }
}
