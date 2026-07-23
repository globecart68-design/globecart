// src/modules/stories/stories.controller.ts
//
// Was never created — stories.module.ts imports it but the file didn't
// exist, so the whole app failed to compile. Routes below match the
// "GET /stories/..." / "POST /stories/..." comments already documented
// above each StoriesService method.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { StoriesService } from './stories.service';
import { CreateStoryDto } from './dto/create-story.dto';

const ALLOWED_MIME =
  /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|x-msvideo|x-m4v|x-matroska))$/;
const MAX_VIDEO_SIZE = 200 * 1024 * 1024; // 200 MB — StoriesService re-checks per-type limits

function fileFilter(
  _req: any,
  file: Express.Multer.File,
  cb: (err: Error | null, accept: boolean) => void,
) {
  if (!ALLOWED_MIME.test(file.mimetype)) {
    return cb(new BadRequestException(`Unsupported file type: ${file.mimetype}`), false);
  }
  cb(null, true);
}

@Controller('stories')
@UseGuards(JwtAuthGuard)
export class StoriesController {
  constructor(private readonly stories: StoriesService) {}

  // ── GET /stories/feed ────────────────────────────────────────────────────
  @Get('feed')
  getFeed(@CurrentUser('id') userId: string) {
    return this.stories.getFeed(userId);
  }

  // ── GET /stories/my ──────────────────────────────────────────────────────
  @Get('my')
  getMyStories(@CurrentUser('id') userId: string) {
    return this.stories.getMyStories(userId);
  }

  // ── GET /stories/presign ─────────────────────────────────────────────────
  @Get('presign')
  getPresignedUrl(
    @CurrentUser('id') userId: string,
    @Query('filename') filename: string,
    @Query('mimeType') mimeType: string,
    @Query('fileSize') fileSize?: string,
  ) {
    return this.stories.getPresignedUrl(
      userId,
      filename,
      mimeType,
      fileSize ? Number(fileSize) : undefined,
    );
  }

  // ── POST /stories  — create story (multipart) ───────────────────────────
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      fileFilter,
      limits: { fileSize: MAX_VIDEO_SIZE },
    }),
  )
  create(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateStoryDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.stories.create(userId, dto, file);
  }

  // ── POST /stories/:id/view ───────────────────────────────────────────────
  @Post(':id/view')
  markViewed(@Param('id') storyId: string, @CurrentUser('id') viewerId: string) {
    return this.stories.markViewed(storyId, viewerId);
  }

  // ── DELETE /stories/:id ──────────────────────────────────────────────────
  @Delete(':id')
  delete(@Param('id') storyId: string, @CurrentUser('id') userId: string) {
    return this.stories.delete(storyId, userId);
  }
}
