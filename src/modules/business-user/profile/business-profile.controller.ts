import { Controller, Get, Patch, Post, Delete, UseGuards, Body, UseInterceptors, UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator, Param, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../../modules/auth/strategies/jwt.strategy';
import { BusinessProfileService } from './business-profile.service';
import { OperatingHoursService } from './operating-hours.service';
import * as businessProfileDto from './dto/business-profile-dto';
import { CreateOperatingHoursDto, UpdateOperatingHoursDto } from './dto/operating-hours.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/profile')
export class BusinessProfileController {
  constructor(
    private readonly service: BusinessProfileService,
    private readonly operatingHoursService: OperatingHoursService,
  ) {}

  /**
   * GET /business/profile
   *
   * Returns the authenticated owner's business profile with aggregated
   * lifetime stats and operating hours.
   */
  @Get()
  getProfile(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getProfile(user.id);
  }

  /**
   * PATCH /business/profile
   *
   * Updates the authenticated owner's business profile.
   * Supports updating: name, description, location, businessType
   */
  @Patch()
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: businessProfileDto.UpdateBusinessProfileDto,
  ) {
    return this.service.updateProfile(user.id, dto);
  }

  /**
   * GET /business/profile/operating-hours
   *
   * Returns all operating hours for the business.
   */
  @Get('operating-hours')
  getOperatingHours(@CurrentUser() user: AuthenticatedUser) {
    return this.operatingHoursService.getOperatingHours(user.id);
  }

  /**
   * POST /business/profile/operating-hours
   *
   * Set or update operating hours for a specific day.
   */
  @Post('operating-hours')
  setOperatingHours(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOperatingHoursDto,
  ) {
    return this.operatingHoursService.setOperatingHours(user.id, dto);
  }

  /**
   * PATCH /business/profile/operating-hours/:dayOfWeek
   *
   * Update operating hours for a specific day.
   */
  @Patch('operating-hours/:dayOfWeek')
  updateOperatingHours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
    @Body() dto: UpdateOperatingHoursDto,
  ) {
    return this.operatingHoursService.updateOperatingHours(user.id, dayOfWeek, dto);
  }

  /**
   * DELETE /business/profile/operating-hours/:dayOfWeek
   *
   * Delete operating hours for a specific day.
   */
  @Delete('operating-hours/:dayOfWeek')
  deleteOperatingHours(
    @CurrentUser() user: AuthenticatedUser,
    @Param('dayOfWeek', ParseIntPipe) dayOfWeek: number,
  ) {
    return this.operatingHoursService.deleteOperatingHours(user.id, dayOfWeek);
  }

  /**
   * PATCH /business/profile/banner
   *
   * Uploads and updates the business banner/profile photo.
   * Max file size: 5 MB
   * Supported types: JPEG, PNG, WebP
   */
  @Patch('banner')
  @UseInterceptors(FileInterceptor('banner'))
  uploadBannerPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadBannerPhoto(user.id, file);
  }

  /**
   * PATCH /business/profile/logo
   *
   * Uploads and updates the business logo/icon.
   * Max file size: 5 MB
   * Supported types: JPEG, PNG, WebP
   */
  @Patch('logo')
  @UseInterceptors(FileInterceptor('logo'))
  uploadLogoPhoto(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadLogoPhoto(user.id, file);
  }
}