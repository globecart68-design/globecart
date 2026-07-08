import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum PaymentTab {
  TRANSACTIONS = 'transactions',
  PAYOUTS = 'payouts',
  INVOICES = 'invoices',
}

export class GetPaymentsQuery {
  @IsOptional()
  @IsEnum(PaymentTab)
  tab?: PaymentTab = PaymentTab.TRANSACTIONS;

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

export interface PaymentBalanceDto {
  availableBalance: number;
  pendingBalance: number;
  totalEarned: number;
}

export interface TransactionDto {
  id: string;
  type: 'order_payment' | 'refund';
  orderId: string;
  orderNumber: string;
  amount: number;
  isCredit: boolean;
  createdAt: Date;
}

export interface PayoutDto {
  id: string;
  amount: number;
  status: 'completed' | 'pending';
  createdAt: Date;
}

export interface InvoiceDto {
  id: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  createdAt: Date;
}

export interface PaymentsPageDto {
  balance: PaymentBalanceDto;
  items: TransactionDto[] | PayoutDto[] | InvoiceDto[];
  total: number;
  page: number;
  totalPages: number;
}