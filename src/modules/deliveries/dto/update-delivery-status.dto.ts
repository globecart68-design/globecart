import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { AssignedOrderStatus } from '@prisma/client';

export class UpdateDeliveryStatusDto {
  @IsIn([
    AssignedOrderStatus.picked_up,
    AssignedOrderStatus.in_transit,
    AssignedOrderStatus.delivered,
    AssignedOrderStatus.failed,
  ])
  status!: AssignedOrderStatus;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
