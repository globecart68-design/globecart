import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Status mapping ──────────────────────────────────────────────────────────
//
// The Flutter client (business_shell/orders) speaks a 7-value status set:
//   new → accepted → preparing → ready → on_delivery → completed
//   new/accepted/preparing/ready → cancelled
//
// The Prisma `OrderStatus` enum is finer-grained (pending, confirmed,
// preparing, ready, assigned, in_transit, delivered, cancelled, refunded)
// because it also has to represent the courier hand-off (assigned/
// in_transit are driven by DeliveriesModule, not by the merchant). We
// translate at the edge here rather than changing either side's vocabulary.

export const APP_ORDER_STATUSES = [
  'new',
  'accepted',
  'preparing',
  'ready',
  'on_delivery',
  'completed',
  'cancelled',
] as const;
export type AppOrderStatus = (typeof APP_ORDER_STATUSES)[number];

const DB_TO_APP: Record<string, AppOrderStatus> = {
  pending: 'new',
  confirmed: 'accepted',
  preparing: 'preparing',
  ready: 'ready',
  assigned: 'on_delivery',
  in_transit: 'on_delivery',
  delivered: 'completed',
  cancelled: 'cancelled',
  refunded: 'cancelled',
};

const APP_TO_DB: Record<AppOrderStatus, string[]> = {
  new: ['pending'],
  accepted: ['confirmed'],
  preparing: ['preparing'],
  ready: ['ready'],
  on_delivery: ['assigned', 'in_transit'],
  completed: ['delivered'],
  cancelled: ['cancelled', 'refunded'],
};

/** Maps a raw DB order status to the app-facing status string. */
export function dbStatusToApp(dbStatus: string): AppOrderStatus {
  return DB_TO_APP[dbStatus] ?? 'new';
}

/** Maps an app-facing status to the set of DB statuses it represents (for filtering). */
export function appStatusToDbFilter(appStatus: string): string[] {
  return APP_TO_DB[appStatus as AppOrderStatus] ?? [];
}

// ─── Query / body DTOs ───────────────────────────────────────────────────────

export class GetOrdersQuery {
  @IsOptional()
  @IsIn(APP_ORDER_STATUSES)
  status?: AppOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  // Order has no paymentMethod/fulfillmentType columns in the current
  // schema. Accepted here for wire-compatibility with the client (so
  // requests don't fail validation) but currently has no effect — wire
  // this in once those columns exist.
  @IsOptional()
  @IsString()
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  fulfillmentType?: string;

  @IsOptional()
  @IsISO8601()
  from?: string;

  @IsOptional()
  @IsISO8601()
  to?: string;

  @IsOptional()
  @IsIn(['newest', 'oldest', 'amount_high', 'amount_low'])
  sort?: string = 'newest';

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

export class RejectOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

/**
 * Forward-only merchant-driven transitions. `on_delivery` is deliberately
 * excluded — that state is entered when a courier claims the order via
 * DeliveriesModule's own claim flow (which also creates the AssignedOrder
 * row the courier queue depends on). Setting it here without going through
 * that flow would make the order invisible to the courier claim query.
 */
export class UpdateOrderStatusDto {
  @IsIn(['preparing', 'ready', 'completed'])
  status!: 'preparing' | 'ready' | 'completed';
}
