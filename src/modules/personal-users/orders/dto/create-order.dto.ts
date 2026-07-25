import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1, { message: 'Quantity must be at least 1.' })
  quantity: number;
}

export class CreateOrderDto {
  @IsString()
  shopId: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Order must contain at least one item.' })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
