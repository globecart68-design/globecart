import { IsString, IsEnum, IsOptional, MinLength } from 'class-validator';

export enum VehicleType {
  motorcycle = 'motorcycle',
  car = 'car',
  tricycle = 'tricycle',
  van = 'van',
  truck = 'truck',
}

export class ApplyAsDriverDto {
  @IsEnum(VehicleType)
  vehicleType!: VehicleType;

  @IsString()
  @MinLength(3)
  licenseNumber!: string;
}

export class ReviewDriverDto {
  @IsEnum(['approved', 'rejected'])
  decision!: 'approved' | 'rejected';

  @IsOptional()
  @IsString()
  reason?: string; // required on rejection, optional on approval
}
