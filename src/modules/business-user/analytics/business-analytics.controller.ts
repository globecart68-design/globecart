import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { BusinessAnalyticsService } from './business-analytics.service';
import { GetAnalyticsQuery, AnalyticsPeriod } from './dto/analytics.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/analytics')
export class BusinessAnalyticsController {
  constructor(private readonly service: BusinessAnalyticsService) {}

  /**
   * GET /business/analytics?period=today|week|month
   *
   * Returns stats, chart data, and top products for the requested period.
   */
  @Get()
  getAnalytics(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetAnalyticsQuery,
  ) {
    return this.service.getAnalytics(
      user.id,
      query.period ?? AnalyticsPeriod.WEEK,
    );
  }
}