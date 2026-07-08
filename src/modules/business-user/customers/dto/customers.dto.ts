import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum CustomerFilter {
  ALL = 'all',
  REGULAR = 'regular',   // 3+ orders
  NEW = 'new',           // first order this week
}

export class GetCustomersQuery {
  @IsOptional()
  @IsEnum(CustomerFilter)
  filter?: CustomerFilter = CustomerFilter.ALL;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface CustomerSummaryDto {
  totalCustomers: number;
  regularCustomers: number;
  newThisWeek: number;
}

export interface CustomerDto {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: Date | null;
  isRegular: boolean;
}

export interface CustomersPageDto {
  summary: CustomerSummaryDto;
  customers: CustomerDto[];
  total: number;
  page: number;
  totalPages: number;
}