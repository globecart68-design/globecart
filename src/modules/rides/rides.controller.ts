import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { RidesService } from './rides.service';
import { RequestRideDto } from './dto/request-ride.dto';
import { CancelRideDto } from './dto/cancel-ride.dto';

@Controller('rides')
@UseGuards(JwtAuthGuard)
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  // ── POST /rides/request ───────────────────────────────────────────────
  @Post('request')
  @HttpCode(HttpStatus.CREATED)
  request(@CurrentUser() user: AuthenticatedUser, @Body() dto: RequestRideDto) {
    return this.ridesService.requestRide(user.id, dto);
  }

  // ── GET /rides/history ────────────────────────────────────────────────
  // Declared before ':id' so "history" isn't swallowed as an id param.
  @Get('history')
  history(@CurrentUser() user: AuthenticatedUser, @Query('cursor') cursor?: string) {
    return this.ridesService.history(user.id, cursor);
  }

  // ── GET /rides/:id ─────────────────────────────────────────────────────
  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.ridesService.findOne(user.id, id);
  }

  // ── POST /rides/:id/cancel ────────────────────────────────────────────
  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: CancelRideDto,
  ) {
    return this.ridesService.cancel(user.id, id, dto);
  }
}
