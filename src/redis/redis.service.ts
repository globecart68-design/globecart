import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Thin wrapper around ioredis. Two responsibilities in this app:
 *
 *  1. Hot cache for "where is this driver right now" — a Redis GEO set
 *     (`geoadd`/`geopos`) keyed by driverId, updated on every
 *     `driver:location:update` WS message. Postgres (DriverLocation) still
 *     gets a row per update for history/audit, but nothing on the request
 *     path waits on that write.
 *  2. Backbone for a Socket.IO Redis adapter (see RealtimeGateway) so
 *     `driver_location_updated` / `ride_status_updated` / etc. broadcast
 *     correctly once this runs on more than one instance.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private _client: Redis;
  private _pub: Redis;
  private _sub: Redis;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('REDIS_URL', 'redis://localhost:6379');
    this._client = new Redis(url, { lazyConnect: true });
    // Socket.IO's Redis adapter needs two dedicated connections (pub/sub
    // can't share a connection with regular commands once SUBSCRIBE is
    // called on it).
    this._pub = new Redis(url, { lazyConnect: true });
    this._sub = new Redis(url, { lazyConnect: true });
  }

  async onModuleInit() {
    // Guard each connect individually: ioredis throws synchronously if
    // .connect() is called while a client's status is already
    // 'connecting' | 'connect' | 'ready'. That shouldn't happen on a
    // normal boot, but Nest's --watch mode can re-run bootstrap() in the
    // same process without a full teardown, which re-triggers
    // onModuleInit on top of clients that are already live. Skip rather
    // than crash the whole app in that case.
    await Promise.all(
      [this._client, this._pub, this._sub].map((redis) => {
        if (redis.status === 'wait' || redis.status === 'end') {
          return redis.connect().catch((err) => {
            this.logger.error(`Redis connect failed: ${err}`);
            throw err;
          });
        }
        this.logger.warn(
          `Skipped redundant connect() — client already in status "${redis.status}"`,
        );
        return Promise.resolve();
      }),
    );
    this.logger.log('✅ Redis connected (client/pub/sub)');
  }

  async onModuleDestroy() {
    await Promise.all([
      this._client.quit(),
      this._pub.quit(),
      this._sub.quit(),
    ]);
  }

  get client(): Redis {
    return this._client;
  }

  get pub(): Redis {
    return this._pub;
  }

  get sub(): Redis {
    return this._sub;
  }

  // ── Driver GEO cache ──────────────────────────────────────────────────
  private readonly DRIVER_GEO_KEY = 'drivers:geo';
  private readonly DRIVER_META_PREFIX = 'drivers:meta:';

  async setDriverLocation(
    driverId: string,
    lat: number,
    lng: number,
  ): Promise<void> {
    await Promise.all([
      this._client.geoadd(this.DRIVER_GEO_KEY, lng, lat, driverId),
      this._client.set(
        `${this.DRIVER_META_PREFIX}${driverId}`,
        JSON.stringify({ lat, lng, updatedAt: new Date().toISOString() }),
        'EX',
        60 * 10, // stale after 10 min of silence
      ),
    ]);
  }

  async getDriverLocation(
    driverId: string,
  ): Promise<{ lat: number; lng: number; updatedAt: string } | null> {
    const raw = await this._client.get(`${this.DRIVER_META_PREFIX}${driverId}`);
    return raw ? JSON.parse(raw) : null;
  }

  /** Nearest available driverIds within radiusKm, closest first. */
  async findNearbyDrivers(
    lat: number,
    lng: number,
    radiusKm: number,
    limit = 10,
  ): Promise<Array<{ driverId: string; distanceKm: number }>> {
    const results = (await this._client.geosearch(
      this.DRIVER_GEO_KEY,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      limit,
      'WITHCOORD',
      'WITHDIST',
    )) as unknown as Array<[string, string, [string, string]]>;

    return results.map(([driverId, distance]) => ({
      driverId,
      distanceKm: parseFloat(distance),
    }));
  }
}
