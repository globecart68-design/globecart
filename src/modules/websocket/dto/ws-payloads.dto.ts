import { IsIn, IsLatitude, IsLongitude, IsOptional, IsString, IsUUID } from 'class-validator';
import { AssignedOrderStatus, RideStatus } from '@prisma/client';

export class SubscribeRideDto {
  @IsUUID()
  rideId!: string;
}

export class SubscribeOrderDto {
  @IsUUID()
  orderId!: string;
}

export class DriverRideLocationDto {
  @IsUUID()
  rideId!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;
}

export class DriverRideAcceptDto {
  @IsUUID()
  rideId!: string;
}

export class DriverRideStatusDto {
  @IsUUID()
  rideId!: string;

  @IsIn([RideStatus.in_progress, RideStatus.completed, RideStatus.cancelled])
  status!: RideStatus;
}

export class CourierOrderLocationDto {
  @IsUUID()
  orderId!: string;

  @IsLatitude()
  lat!: number;

  @IsLongitude()
  lng!: number;

  @IsOptional()
  @IsLatitude()
  destinationLat?: number;

  @IsOptional()
  @IsLongitude()
  destinationLng?: number;
}

export class CourierOrderStatusDto {
  @IsUUID()
  orderId!: string;

  @IsIn([
    AssignedOrderStatus.picked_up,
    AssignedOrderStatus.in_transit,
    AssignedOrderStatus.delivered,
    AssignedOrderStatus.failed,
  ])
  status!: AssignedOrderStatus;

  @IsOptional()
  @IsString()
  note?: string;
}
