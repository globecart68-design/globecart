import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  /**
   * POST /orders
   * Creates an order for the authenticated customer from their cart.
   * Rejects if the shop's minimum order amount isn't met.
   */
  @Post()
  createOrder(
    @CurrentUser('id') customerId: string,
    @Body() dto: CreateOrderDto,
  ) {
    return this.ordersService.createOrder(customerId, dto);
  }
}
