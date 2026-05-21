import { IsString, IsEnum, IsOptional, MinLength } from 'class-validator';

export enum DeliveryVehicleType {
  motorcycle = 'motorcycle',
  bicycle = 'bicycle',
  car = 'car',
  van = 'van',
  truck = 'truck',
}

export class ApplyAsDeliveryDto {
  @IsEnum(DeliveryVehicleType)
  vehicleType!: DeliveryVehicleType;

  @IsString()
  @MinLength(3)
  licenseNumber!: string;
}

export class ReviewDeliveryDto {
  @IsEnum(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  reason?: string;
}
