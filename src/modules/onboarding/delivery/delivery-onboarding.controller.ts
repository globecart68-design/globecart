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
import { DeliveryOnboardingService } from './delivery-onboarding.service';
import { ApplyAsDeliveryDto, ReviewDeliveryDto } from './dto/delivery-onboarding.dto';

@UseGuards(JwtAuthGuard)
@Controller('onboarding/delivery')
export class DeliveryOnboardingController {
  constructor(private readonly service: DeliveryOnboardingService) {}

  // ─── User: submit / update application ───────────────────────────────────

  @Post('apply')
  apply(
    @CurrentUser('id') userId: string,
    @Body() dto: ApplyAsDeliveryDto,
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
  @Patch(':deliveryId/review')
  review(
    @Param('deliveryId') deliveryId: string,
    @Body() dto: ReviewDeliveryDto,
  ) {
    return this.service.review(deliveryId, dto);
  }
}
