import {
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

export const RIDE_VEHICLE_TYPES = ['economy', 'comfort', 'xl', 'bike'] as const;
export type RideVehicleType = (typeof RIDE_VEHICLE_TYPES)[number];

export class RequestRideDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  pickupLocation!: string;

  @IsLatitude()
  pickupLat!: number;

  @IsLongitude()
  pickupLng!: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  dropLocation!: string;

  @IsLatitude()
  dropLat!: number;

  @IsLongitude()
  dropLng!: number;

  @IsIn(RIDE_VEHICLE_TYPES)
  vehicleType!: RideVehicleType;
}
