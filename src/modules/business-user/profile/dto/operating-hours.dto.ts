import { IsOptional, IsString, IsBoolean, IsInt, Min, Max, Matches } from 'class-validator';

export class OperatingHourDto {
  dayOfWeek!: number; // 0=Monday, 1=Tuesday, ..., 6=Sunday
  isOpen!: boolean;
  openTime?: string; // Format: "HH:MM"
  closeTime?: string; // Format: "HH:MM"
}

export class UpdateOperatingHoursDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'openTime must be in HH:MM format' })
  openTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'closeTime must be in HH:MM format' })
  closeTime?: string;
}

export class CreateOperatingHoursDto {
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @IsOptional()
  @IsBoolean()
  isOpen?: boolean;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'openTime must be in HH:MM format' })
  openTime?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'closeTime must be in HH:MM format' })
  closeTime?: string;
}

export interface OperatingHourResponseDto {
  id: string;
  dayOfWeek: number;
  isOpen: boolean;
  openTime: string | null;
  closeTime: string | null;
}
