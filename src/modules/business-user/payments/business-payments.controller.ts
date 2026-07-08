import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { BusinessPaymentsService } from './business-payments.service';
import { GetPaymentsQuery, PaymentTab } from './dto/payments.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/payments')
export class BusinessPaymentsController {
  constructor(private readonly service: BusinessPaymentsService) {}

  /**
   * GET /business/payments?tab=transactions|payouts|invoices&page=1&limit=20
   *
   * Returns balance + paginated items for the requested tab.
   */
  @Get()
  getPayments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: GetPaymentsQuery,
  ) {
    return this.service.getPayments(
      user.id,
      query.tab ?? PaymentTab.TRANSACTIONS,
      query.page ?? 1,
      query.limit ?? 20,
    );
  }
}