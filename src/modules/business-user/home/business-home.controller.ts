import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../modules/auth/strategies/jwt.strategy';
import { BusinessHomeService } from './business-home.service';
import { GetDashboardQuery } from './dto/home-dashboard.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/home')
export class BusinessHomeController {
  constructor(private readonly service: BusinessHomeService) {}

  /**
   * GET /business/home/dashboard
   *
   * Returns today's overview, business info, and recent orders for the
   * authenticated business owner's primary business.
   *
   * Query params:
   *   - limit (optional, 1–50, default 10): number of recent orders to include
   */
  @Get('dashboard')
  getDashboard(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetDashboardQuery,
  ) {
    return this.service.getDashboard(user.id, query.limit);
  }
}
