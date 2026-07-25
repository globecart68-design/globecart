import { IsOptional, IsString, MaxLength, MinLength, IsEnum, IsNumber, Min } from 'class-validator';
import { BusinessType } from '@prisma/client';
import { OperatingHourResponseDto } from './operating-hours.dto';

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface BusinessStatsDto {
  totalOrders: number;
  totalRevenue: number;
  totalCustomers: number;
  averageRating: number;
  reviewCount: number;
  followerCount: number;
}

export interface BusinessProfileDto {
  id: string;
  name: string;
  businessType: string;
  description: string | null;
  location: string | null;
  logoPhoto: string | null;
  bannerPhoto: string | null;
  isActive: boolean;
  createdAt: Date;
  minOrderAmount: number | null;

  /** Aggregated lifetime stats. */
  stats: BusinessStatsDto;

  /** Operating hours for each day of the week. */
  operatingHours: OperatingHourResponseDto[];
}

// ─── Request shapes ───────────────────────────────────────────────────────────

export class UpdateBusinessProfileDto {
  /**
   * Display name of the business.
   * 2–80 characters, optional on every PATCH.
   */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Business name must be at least 2 characters.' })
  @MaxLength(80, { message: 'Business name cannot exceed 80 characters.' })
  name?: string;

  /**
   * Short bio / about text.
   * Pass `null` to clear the field.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'Description cannot exceed 500 characters.' })
  description?: string | null;

  /**
   * City, region, or address the business operates from.
   * Pass `null` to clear the field.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'Location cannot exceed 200 characters.' })
  location?: string | null;

  /**
   * Business category/type for the shop.
   */
  @IsOptional()
  @IsEnum(BusinessType, { message: 'Invalid business type selected.' })
  businessType?: BusinessType;

  /**
   * Minimum order subtotal a customer must reach to check out from this shop.
   * Pass `null` to remove the minimum (no threshold).
   */
  @IsOptional()
  @IsNumber({}, { message: 'Minimum order amount must be a number.' })
  @Min(0, { message: 'Minimum order amount cannot be negative.' })
  minOrderAmount?: number | null;
}