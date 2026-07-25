import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { BusinessOrdersService } from './business-orders.service';
import {
  GetOrdersQuery,
  RejectOrderDto,
  UpdateOrderStatusDto,
} from './dto/orders.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/orders')
export class BusinessOrdersController {
  constructor(private readonly service: BusinessOrdersService) {}

  /**
   * GET /business/orders
   *
   * Paginated, filterable list of orders for the authenticated business
   * owner. Matches the query params the Orders tab already sends: status,
   * search, paymentMethod, fulfillmentType, from, to, sort, page, limit.
   */
  @Get()
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetOrdersQuery,
  ) {
    return this.service.listOrders(user.id, query);
  }

  /**
   * GET /business/orders/counts
   *
   * Per-status counts, used to badge the status chips and the bottom nav
   * "New" indicator without paging through every order.
   */
  @Get('counts')
  getStatusCounts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getStatusCounts(user.id);
  }

  /**
   * GET /business/orders/:id
   */
  @Get(':id')
  getOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
  ) {
    return this.service.getOrder(user.id, orderId);
  }

  /**
   * POST /business/orders/:id/accept
   *
   * Moves a "new" order to "accepted". Only valid from "new".
   */
  @Post(':id/accept')
  acceptOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
  ) {
    return this.service.acceptOrder(user.id, orderId);
  }

  /**
   * POST /business/orders/:id/reject
   *
   * Cancels an order. Only valid from "new" or "accepted".
   */
  @Post(':id/reject')
  rejectOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
    @Body() dto: RejectOrderDto,
  ) {
    return this.service.rejectOrder(user.id, orderId, dto.reason);
  }

  /**
   * PATCH /business/orders/:id/status
   *
   * Advances an order through the merchant-driven workflow:
   * accepted → preparing → ready → completed. (See UpdateOrderStatusDto
   * for why "on_delivery" isn't accepted here.)
   */
  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') orderId: string,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.service.updateStatus(user.id, orderId, dto.status);
  }
}
