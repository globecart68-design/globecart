import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { DeliveriesService } from './deliveries.service';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';

@Controller('deliveries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('delivery')
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  // ── GET /deliveries/available ─────────────────────────────────────────
  // The claim queue — ready orders nobody has accepted yet. Declared
  // before ':orderId'-shaped routes below so these path segments aren't
  // swallowed as an id param.
  @Get('available')
  available(@Query('cursor') cursor?: string) {
    return this.deliveriesService.findAvailable(cursor);
  }

  // ── GET /deliveries/assigned ──────────────────────────────────────────
  @Get('assigned')
  assigned(@CurrentUser() user: AuthenticatedUser) {
    return this.deliveriesService.findAssigned(user.id);
  }

  // ── GET /deliveries/history ────────────────────────────────────────────
  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Query('cursor') cursor?: string) {
    return this.deliveriesService.history(user.id, cursor);
  }

  // ── POST /deliveries/:orderId/accept ───────────────────────────────────
  @Post(':orderId/accept')
  accept(@CurrentUser() user: AuthenticatedUser, @Param('orderId') orderId: string) {
    return this.deliveriesService.accept(user.id, orderId);
  }

  // ── POST /deliveries/:orderId/status ───────────────────────────────────
  // REST fallback for the same action the WS `delivery:order:status`
  // event performs — useful for a courier app step that isn't already
  // socket-connected (e.g. a background/offline queue flushing later).
  @Post(':orderId/status')
  updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId') orderId: string,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveriesService.updateStatus(user.id, orderId, dto.status, dto.note);
  }
}
