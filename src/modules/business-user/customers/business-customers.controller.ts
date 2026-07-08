import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { BusinessCustomersService } from './business-customers.service';
import { GetCustomersQuery, CustomerFilter } from './dto/customers.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/customers')
export class BusinessCustomersController {
  constructor(private readonly service: BusinessCustomersService) {}

  /**
   * GET /business/customers?filter=all|regular|new&search=&page=1&limit=20
   *
   * Returns paginated customers with summary stats and per-customer aggregates.
   */
  @Get()
  getCustomers(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetCustomersQuery,
  ) {
    return this.service.getCustomers(
      user.id,
      query.filter ?? CustomerFilter.ALL,
      query.search,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}