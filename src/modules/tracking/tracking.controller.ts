import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { TrackingService } from './tracking.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  // ── GET /orders/:id/tracking ────────────────────────────────────────────
  @Get('orders/:id/tracking')
  getTracking(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.trackingService.getForOrder(user.id, id);
  }
}
