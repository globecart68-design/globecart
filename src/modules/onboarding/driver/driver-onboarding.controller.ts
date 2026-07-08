import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { DriverOnboardingService } from './driver-onboarding.service';
import { ApplyAsDriverDto, ReviewDriverDto } from './dto/driver-onboarding.dto';

@UseGuards(JwtAuthGuard)
@Controller('onboarding/driver')
export class DriverOnboardingController {
  constructor(private readonly service: DriverOnboardingService) {}

  // ─── User: submit / update application ───────────────────────────────────

  @Post('apply')
  apply(
    @CurrentUser('id') userId: string,
    @Body() dto: ApplyAsDriverDto,
  ) {
    return this.service.apply(userId, dto);
  }

  // ─── User: check own application status ──────────────────────────────────

  @Get('status')
  getStatus(@CurrentUser('id') userId: string) {
    return this.service.getMyStatus(userId);
  }

  // ─── Admin: list all pending applications ─────────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Get('pending')
  listPending() {
    return this.service.listPending();
  }

  // ─── Admin: approve or reject an application ──────────────────────────────

  @UseGuards(RolesGuard)
  @Roles('admin')
  @Patch(':driverId/review')
  review(
    @Param('driverId') driverId: string,
    @Body() dto: ReviewDriverDto,
  ) {
    return this.service.review(driverId, dto);
  }
}
