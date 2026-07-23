import { Injectable } from '@nestjs/common';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RideFareEstimate {
  vehicleType: string;
  distanceKm: number;
  etaMinutes: number;
  price: number;
}

const VEHICLE_RATES: Record<
  string,
  { base: number; perKm: number; perMin: number; avgSpeedKmh: number }
> = {
  economy: { base: 15, perKm: 4.5, perMin: 0.5, avgSpeedKmh: 28 },
  comfort: { base: 25, perKm: 6.0, perMin: 0.7, avgSpeedKmh: 30 },
  xl: { base: 35, perKm: 7.5, perMin: 0.9, avgSpeedKmh: 26 },
  bike: { base: 8, perKm: 2.5, perMin: 0.3, avgSpeedKmh: 22 },
};

/**
 * Shared geo utilities for the Map Hub backend — kept deliberately
 * dependency-free (no PostGIS, no external routing API) so it runs
 * anywhere. Swap `_haversineKm` for a real routing provider (Google
 * Directions, OSRM, Mapbox) when road-distance accuracy matters more than
 * "works with zero extra infra".
 */
@Injectable()
export class MapsService {
  /** Great-circle distance in km between two points. */
  distanceKm(a: LatLng, b: LatLng): number {
    const R = 6371; // Earth radius, km
    const dLat = this._toRad(b.lat - a.lat);
    const dLng = this._toRad(b.lng - a.lng);
    const lat1 = this._toRad(a.lat);
    const lat2 = this._toRad(b.lat);

    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return R * c;
  }

  /** ETA in whole minutes at the vehicle type's assumed average speed. */
  etaMinutes(distanceKm: number, vehicleType = 'economy'): number {
    const rate = VEHICLE_RATES[vehicleType] ?? VEHICLE_RATES.economy;
    const hours = distanceKm / rate.avgSpeedKmh;
    return Math.max(1, Math.round(hours * 60));
  }

  /** One fare estimate for a single vehicle type. */
  estimateFare(pickup: LatLng, drop: LatLng, vehicleType: string): RideFareEstimate {
    const rate = VEHICLE_RATES[vehicleType] ?? VEHICLE_RATES.economy;
    const distanceKm = this.distanceKm(pickup, drop);
    const eta = this.etaMinutes(distanceKm, vehicleType);
    const price = Math.round(rate.base + distanceKm * rate.perKm + eta * rate.perMin);
    return { vehicleType, distanceKm: Math.round(distanceKm * 10) / 10, etaMinutes: eta, price };
  }

  /** Fare estimate for every supported vehicle type — backs the Ride tab's list. */
  estimateAllFares(pickup: LatLng, drop: LatLng): RideFareEstimate[] {
    return Object.keys(VEHICLE_RATES).map((type) =>
      this.estimateFare(pickup, drop, type),
    );
  }

  private _toRad(deg: number): number {
    return (deg * Math.PI) / 180;
  }
}
