// src/modules/stories/stories.controller.ts

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';

const ALLOWED_MIME_TYPES = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|x-msvideo|x-m4v|x-matroska))$/;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;  //  20 MB for images
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB for videos

function fileSizeFilter(
  req: any,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile: boolean) => void,
) {
  if (!ALLOWED_MIME_TYPES.test(file.mimetype)) {
    return cb(new Error(`Unsupported file type: ${file.mimetype}`), false);
  }
  cb(null, true);
}

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  // ─────────────────────────────────────────────
  // GET /stories/feed
  // Stories from followed users + own stories
  // ─────────────────────────────────────────────

  @Get('feed')
  getFeed(@CurrentUser() user: any) {
    return this.storiesService.getFeed(user.id);
  }

  // ─────────────────────────────────────────────
  // GET /stories/my
  // Own active stories with viewer counts
  // ─────────────────────────────────────────────

  @Get('my')
  getMyStories(@CurrentUser() user: any) {
    return this.storiesService.getMyStories(user.id);
  }

  // ─────────────────────────────────────────────
  // GET /stories/presign?filename=photo.jpg&mimeType=image/jpeg&fileSize=102400
  // Returns a pre-signed S3 PUT URL for direct Flutter → S3 upload
  // ─────────────────────────────────────────────

  private static readonly PRESIGN_ALLOWED_TYPES = new Set([
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/quicktime', 'video/x-msvideo',
    'video/x-m4v', 'video/x-matroska',
  ]);
  private static readonly PRESIGN_MAX_BYTES = 200 * 1024 * 1024; // 200 MB

  @Get('presign')
  getPresignedUrl(
    @CurrentUser() userId: string,
    @Query('filename') filename: string,
    @Query('mimeType') mimeType: string,
    @Query('fileSize') fileSize?: string,
  ) {
    if (!filename || !mimeType) {
      throw new BadRequestException('filename and mimeType are required');
    }
    if (!StoriesController.PRESIGN_ALLOWED_TYPES.has(mimeType)) {
      throw new BadRequestException(`Unsupported mimeType: ${mimeType}`);
    }
    const size = fileSize ? parseInt(fileSize, 10) : undefined;
    if (size !== undefined) {
      if (isNaN(size) || size <= 0) {
        throw new BadRequestException('fileSize must be a positive integer');
      }
      if (size > StoriesController.PRESIGN_MAX_BYTES) {
        throw new BadRequestException(
          `File too large. Max presign size is ${StoriesController.PRESIGN_MAX_BYTES / 1024 / 1024} MB`,
        );
      }
    }
    return this.storiesService.getPresignedUrl(userId, filename, mimeType, size);
  }

  // ─────────────────────────────────────────────
  // POST /stories
  // Create story — multipart (image file) OR JSON (text card / remote URL)
  //
  // Multipart:  field "file" = image binary
  //             field "textContent" / "backgroundColor" optional
  // JSON body:  { contentUrl?, textContent?, backgroundColor? }
  // ─────────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_VIDEO_SIZE }, // enforced per-type below in service
      fileFilter: fileSizeFilter,
    }),
  )
  create(
    @CurrentUser() userId: string,
    @Body() dto: CreateStoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.storiesService.create(userId, dto, file);
  }

  // ─────────────────────────────────────────────
  // POST /stories/:id/view
  // Mark a story as viewed
  // ─────────────────────────────────────────────

  @Post(':id/view')
  @HttpCode(HttpStatus.OK)
  markViewed(
    @CurrentUser() userId: string,
    @Param('id') storyId: string,
  ) {
    return this.storiesService.markViewed(storyId, userId);
  }

  // ─────────────────────────────────────────────
  // DELETE /stories/:id
  // Delete own story
  // ─────────────────────────────────────────────

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(
    @CurrentUser() userId: string,
    @Param('id') storyId: string,
  ) {
    return this.storiesService.delete(storyId, userId);
  }
}