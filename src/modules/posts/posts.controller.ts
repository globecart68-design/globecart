// src/modules/posts/posts.controller.ts

import {
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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PostsService } from './posts.service';

const ALLOWED_MIME = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|quicktime|x-msvideo|x-m4v|x-matroska))$/;
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;   // 20 MB
const MAX_VIDEO_SIZE = 200 * 1024 * 1024;  // 200 MB

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

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // ── POST /posts  — create post (multipart) ────────────────────────────────
  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, { storage: memoryStorage(), fileFilter }),
  )
  async create(
    @CurrentUser() user: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('caption') caption?: string,
    @Body('audience') audience?: string,
    @Body('locationTag') locationTag?: string,
    @Body('mediaType') mediaType?: 'image' | 'video',
  ) {
    const resolvedFiles = files ?? [];
    if (resolvedFiles.length === 0) {
      throw new BadRequestException('At least one media file is required');
    }

    const isVideo = resolvedFiles.some((file) => file.mimetype.startsWith('video/'));
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    for (const file of resolvedFiles) {
      if (file.size > maxSize) {
        throw new BadRequestException(
          `File too large. Max ${isVideo ? '200MB' : '20MB'}.`,
        );
      }
    }

    return this.postsService.create(user.id, resolvedFiles, {
      caption,
      audience,
      locationTag,
      mediaType,
    });
  }

  // ── GET /posts/feed ───────────────────────────────────────────────────────
  @Get('feed')
  getFeed(
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getFeed(user.id, cursor, take ? parseInt(take) : 20);
  }

  // ── GET /posts/user/:userId ───────────────────────────────────────────────
  @Get('user/:userId')
  getUserPosts(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getUserPosts(
      user.id,
      userId,
      cursor,
      take ? parseInt(take) : 20,
    );
  }

  // ── GET /posts/saved ──────────────────────────────────────────────────────
  @Get('saved')
  getSavedPosts(
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getSavedPosts(
      user.id,
      cursor,
      take ? parseInt(take) : 20,
    );
  }

  // ── GET /posts/liked ───────────────────────────────────────────────────────
  @Get('liked')
  getLikedPosts(
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getLikedPosts(
      user.id,
      cursor,
      take ? parseInt(take) : 20,
    );
  }

  // ── GET /posts/my-repost ─────────────────────────────────────────────────
  @Get('my-repost')
  getMyRepost(
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getMyRepost(
      user.id,
      cursor,
      take ? parseInt(take) : 20,
    );
  }

  // ── GET /posts/:id ────────────────────────────────────────────────────────
  @Get(':id')
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.findOne(user.id, id);
  }

  // ── DELETE /posts/:id ─────────────────────────────────────────────────────
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.delete(user.id, id);
  }

  // ── POST /posts/:id/like ──────────────────────────────────────────────────
  @Post(':id/like')
  @HttpCode(HttpStatus.OK)
  like(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.like(user.id, id);
  }

  // ── POST /posts/:id/share ─────────────────────────────────────────────────
  @Post(':id/share')
  @HttpCode(HttpStatus.OK)
  share(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.share(user.id, id);
  }

  // ── POST /posts/:id/save ──────────────────────────────────────────────────
  @Post(':id/save')
  @HttpCode(HttpStatus.OK)
  save(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.save(user.id, id);
  }

  // ── POST /posts/:id/repost ───────────────────────────────────────────────
  @Post(':id/repost')
  @HttpCode(HttpStatus.OK)
  repost(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('caption') caption?: string,
  ) {
    return this.postsService.repost(user.id, id, caption?.trim());
  }

  // ── GET /posts/user/:userId/repost ─────────────────────────────────────
  @Get('user/:userId/repost')
  getUserRepost(
    @CurrentUser() user: any,
    @Param('userId') userId: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getUserRepost(
      user.id,
      userId,
      cursor,
      take ? parseInt(take) : 20,
    );
  }

  // ── GET /posts/:id/repost ────────────────────────────────────────────────
  @Get(':id/repost')
  getRepostOfPost(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getRepostOfPost(
      id,
      cursor,
      take ? parseInt(take) : 20,
    );
  }

  // ── GET /posts/:id/comments ───────────────────────────────────────────────
  @Get(':id/comments')
  getComments(
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.postsService.getComments(id, cursor, take ? parseInt(take) : 30);
  }

  // ── POST /posts/:id/comments ──────────────────────────────────────────────
  @Post(':id/comments')
  @HttpCode(HttpStatus.CREATED)
  addComment(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body('body') body: string,
  ) {
    if (!body?.trim()) throw new BadRequestException('Comment body is required');
    return this.postsService.addComment(user.id, id, body.trim());
  }

  // ── DELETE /posts/:id/comments/:commentId ─────────────────────────────────
  @Delete(':id/comments/:commentId')
  @HttpCode(HttpStatus.OK)
  deleteComment(
    @CurrentUser() user: any,
    @Param('id') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.postsService.deleteComment(user.id, postId, commentId);
  }
}