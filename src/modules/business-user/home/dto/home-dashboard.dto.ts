import { IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetDashboardQuery {
  /** How many recent orders to return (default 10, max 50) */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;
}

// ─── Response shapes (no class-validator needed — outbound only) ──────────────

export interface TodayOverviewDto {
  revenue: number;
  orderCount: number;
  avgOrderValue: number;
  returnCount: number;
}

export interface RecentOrderDto {
  id: string;
  orderNumber: string;
  customerName: string;
  itemCount: number;
  total: number;
  status: string;
  createdAt: Date;
}

export interface BusinessInfoDto {
  id: string;
  name: string;
  logoPhoto: string | null;
  location: string | null;
  isActive: boolean;
}

export interface HomeDashboardDto {
  business: BusinessInfoDto;
  today: TodayOverviewDto;
  recentOrders: RecentOrderDto[];
}