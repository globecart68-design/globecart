// profile/profile.controller.ts

import {
  Controller,
  Get,
  Patch,
  Put,
  Delete,
  Body,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  BadRequestException,
  Query,
  Param,
} from '@nestjs/common';

import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { ProfileService } from './profile.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';

const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

@UseGuards(JwtAuthGuard)
@Controller('profile')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get('me')
  getMyProfile(@CurrentUser() user: any) {
    console.log('Current user ID:', user.id);
    return this.profiles.findByUserId(user.id);
  }

  @Patch('me')
  updateProfile(
    @CurrentUser() user: any,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.profiles.updateProfile(user.id, dto);
  }

  // FIX 1: Moved ABOVE @Get(':userId') so NestJS matches the literal path
  // 'check-handle' before it tries to interpret it as a :userId param.
  // Previously the order was reversed, causing every request to
  // GET /profile/check-handle to be handled by getUserProfile('check-handle'),
  // which threw a not-found error that the Flutter client caught and
  // displayed as "Failed to check handle".
  //
  // FIX 2: Removed decodeURIComponent(). The Flutter client was fixed to
  // pass the raw handle string directly via Dio queryParameters (which does
  // its own encoding). Calling decodeURIComponent on an already-decoded value
  // is a no-op for most characters, but it would corrupt handles that
  // legitimately contained a '%' if any ever slipped through.
  @Get('check-handle')
  checkHandleAvailability(
    @Query('handle') handle: string,
    @CurrentUser() user: any,
  ) {
    if (!handle) {
      throw new BadRequestException('Handle is required');
    }

    return this.profiles.checkHandleAvailability(handle, user.id);
  }

  @Get(':userId')
  getUserProfile(@Param('userId') userId: string) {
    return this.profiles.findByUserId(userId);
  }

  @Put('me/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: AVATAR_MAX_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Only JPEG, PNG and WebP are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  updateAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    return this.profiles.updateAvatar(userId, file);
  }

  @Delete('me/avatar')
  removeAvatar(@CurrentUser('id') userId: string) {
    return this.profiles.removeAvatar(userId);
  }
}