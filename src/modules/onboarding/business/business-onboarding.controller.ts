import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { BusinessOnboardingService } from './business-onboarding.service';
import { RegisterBusinessDto, UpdateBusinessDto } from './dto/business-onboarding.dto';

const MAX_LOGO_BYTES = 5 * 1024 * 1024; // 5 MB

@UseGuards(JwtAuthGuard)
@Controller('onboarding/business')
export class BusinessOnboardingController {
  constructor(private readonly service: BusinessOnboardingService) {}

  // ─── Register a new shop ──────────────────────────────────────────────────
  // Any authenticated user can open a shop. Role is granted inside the service.

  @Post('register')
  register(
    @CurrentUser('id') userId: string,
    @Body() dto: RegisterBusinessDto,
  ) {
    return this.service.register(userId, dto);
  }

  // ─── List my shops ────────────────────────────────────────────────────────

  @Get('my-businesses')
  getMyBusinesses(@CurrentUser('id') userId: string) {
    return this.service.getMyBusinesses(userId);
  }

  // ─── Get a single shop ────────────────────────────────────────────────────

  @Get(':businessId')
  getMyBusiness(
    @Param('businessId') businessId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.getMyBusiness(businessId, userId);
  }

  // ─── Update shop details ──────────────────────────────────────────────────

  @Patch(':businessId')
  update(
    @Param('businessId') businessId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateBusinessDto,
  ) {
    return this.service.update(businessId, userId, dto);
  }

  // ─── Upload shop logo ─────────────────────────────────────────────────────

  @Patch(':businessId/logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @Param('businessId') businessId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_LOGO_BYTES }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadLogo(businessId, userId, file);
  }

  // ─── Publish shop (go live) ───────────────────────────────────────────────

  @Patch(':businessId/publish')
  publish(
    @Param('businessId') businessId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.publish(businessId, userId);
  }

  // ─── Unpublish shop ───────────────────────────────────────────────────────

  @Patch(':businessId/unpublish')
  unpublish(
    @Param('businessId') businessId: string,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.unpublish(businessId, userId);
  }
}
