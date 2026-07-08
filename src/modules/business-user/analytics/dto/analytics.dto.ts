import { IsEnum, IsOptional } from 'class-validator';

export enum AnalyticsPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
}

export class GetAnalyticsQuery {
  @IsOptional()
  @IsEnum(AnalyticsPeriod)
  period?: AnalyticsPeriod = AnalyticsPeriod.WEEK;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ChartPointDto {
  label: string;
  revenue: number;
}

export interface AnalyticsStatsDto {
  totalRevenue: number;
  revenueChange: number;   // percentage vs previous period, e.g. 12.4
  totalOrders: number;
  ordersChange: number;
  avgOrderValue: number;
  avgOrderChange: number;
  newCustomers: number;
  newCustomersChange: number;
  returnCount: number;
  returnsChange: number;
}

export interface TopProductDto {
  id: string;
  name: string;
  category: string;
  salesCount: number;
  revenue: number;
}

export interface AnalyticsDto {
  period: string;
  stats: AnalyticsStatsDto;
  chart: ChartPointDto[];
  topProducts: TopProductDto[];
}