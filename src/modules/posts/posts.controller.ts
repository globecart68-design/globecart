// src/modules/posts/posts.controller.ts
//
// CHANGE: auth is no longer applied at the controller level. It's now
// per-route:
//   - Viewing (feed, single post, comments) uses OptionalJwtAuthGuard so
//     guests can browse (TikTok-style) while logged-in users still get
//     personalized likedByMe/savedByMe/iFollowThem flags.
//   - Everything that mutates state (create, like, share, save, repost,
//     comment write/delete, delete post) or reads private per-user data
//     (getUserPosts is public-ish but still needs @CurrentUser for the
//     "is this my own profile" check; getSavedPosts/getLikedPosts/getMyRepost
//     are inherently private) keeps the hard JwtAuthGuard.

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
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
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
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  // ── POST /posts  — create post (multipart) ────────────────────────────────
  @Post()
  @UseGuards(JwtAuthGuard)
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
    @Body('musicId') musicId?: string,
    @Body('musicStart') musicStart?: string,
    @Body('musicDuration') musicDuration?: string,
    @Body('musicVolume') musicVolume?: string,
    @Body('useOriginalAudio') useOriginalAudio?: string,
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

    if (musicId && useOriginalAudio === 'true') {
      throw new BadRequestException(
        'Send either musicId or useOriginalAudio, not both',
      );
    }

    return this.postsService.create(user.id, resolvedFiles, {
      caption,
      audience,
      locationTag,
      mediaType,
      musicId,
      musicStart: musicStart !== undefined ? parseInt(musicStart) : undefined,
      musicDuration: musicDuration !== undefined ? parseInt(musicDuration) : undefined,
      musicVolume: musicVolume !== undefined ? parseFloat(musicVolume) : undefined,
      useOriginalAudio: useOriginalAudio === 'true',
    });
  }

  // ── GET /posts/feed ───────────────────────────────────────────────────────
  // Guest-viewable. With no/invalid token: public discovery feed, all
  // interaction flags false. With a valid token: personalized following
  // feed with real likedByMe/savedByMe/etc.
  @Get('feed')
  @UseGuards(OptionalJwtAuthGuard)
  getFeed(
    @CurrentUser() user: any,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
    @Query('filter') filter?: string,
  ) {
    const allowed = ['following', 'forYou', 'friends'] as const;
    const resolvedFilter = allowed.includes(filter as any)
      ? (filter as 'following' | 'forYou' | 'friends')
      : 'forYou';

    return this.postsService.getFeed(
      user?.id,
      cursor,
      take ? parseInt(take) : 20,
      resolvedFilter,
    );
  }

  // ── GET /posts/user/:userId ───────────────────────────────────────────────
  // Kept behind JwtAuthGuard: needs a real viewerId to correctly decide
  // whether the caller is viewing their own profile (which unlocks
  // 'only_me' posts). A guest just sees the same as any non-owner viewer,
  // so there's no real loss in still requiring login here for now.
  @Get('user/:userId')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  // Guest-viewable — opening a single post (e.g. from a share link) shouldn't
  // require login either.
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.findOne(user?.id, id);
  }

  // ── DELETE /posts/:id ─────────────────────────────────────────────────────
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  delete(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.delete(user.id, id);
  }

  // ── POST /posts/:id/like ──────────────────────────────────────────────────
  @Post(':id/like')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  like(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.like(user.id, id);
  }

  // ── POST /posts/:id/share ─────────────────────────────────────────────────
  @Post(':id/share')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  share(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.share(user.id, id);
  }

  // ── POST /posts/:id/save ──────────────────────────────────────────────────
  @Post(':id/save')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  save(@CurrentUser() user: any, @Param('id') id: string) {
    return this.postsService.save(user.id, id);
  }

  // ── POST /posts/:id/repost ───────────────────────────────────────────────
  @Post(':id/repost')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
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
  // Read-only, no per-viewer data returned — safe to leave fully public.
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
  // Already had no auth dependency (no @CurrentUser used) — explicitly public
  // now that the controller-level guard is gone, matching TikTok (anyone can
  // read comments; only posting one requires login).
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
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  deleteComment(
    @CurrentUser() user: any,
    @Param('id') postId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.postsService.deleteComment(user.id, postId, commentId);
  }
}