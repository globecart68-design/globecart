// src/modules/music/music.controller.ts
//
// Read routes (list/detail/trending/search/usage) use OptionalJwtAuthGuard
// so browsing the sound library works for guests too (TikTok lets anyone
// scroll a song page without an account) while still personalizing
// `favoritedByMe` for logged-in callers. Everything that mutates state
// (upload, use, favorite/unfavorite) keeps the hard JwtAuthGuard, matching
// the pattern already used in PostsController/StoriesController.

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
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { MusicSource } from '@prisma/client';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { MusicService } from './music.service';
import { UploadMusicDto } from './dto/upload-music.dto';

@Controller('music')
export class MusicController {
  constructor(private readonly musicService: MusicService) {}

  // ── GET /music  (library, paginated) ───────────────────────────────────────
  @Get()
  list(
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
    @Query('source') source?: string,
  ) {
    const resolvedSource =
      source === 'library' || source === 'original' ? (source as MusicSource) : undefined;
    return this.musicService.list(cursor, take ? parseInt(take) : 20, resolvedSource);
  }

  // ── GET /music/trending ──────────────────────────────────────────────────
  // Declared before ':id' so it isn't swallowed by the dynamic route.
  @Get('trending')
  trending(@Query('take') take?: string) {
    return this.musicService.trending(take ? parseInt(take) : 20);
  }

  // ── GET /music/search?q= ─────────────────────────────────────────────────
  @Get('search')
  search(
    @Query('q') q?: string,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    if (!q?.trim()) throw new BadRequestException('q is required');
    return this.musicService.search(q, cursor, take ? parseInt(take) : 20);
  }

  // ── POST /music/upload ───────────────────────────────────────────────────
  // multipart: field "audio" (required), field "artwork" (optional image)
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'audio', maxCount: 1 },
        { name: 'artwork', maxCount: 1 },
      ],
      { storage: memoryStorage() },
    ),
  )
  upload(
    @CurrentUser() user: any,
    @UploadedFiles()
    files: { audio?: Express.Multer.File[]; artwork?: Express.Multer.File[] },
    @Body() dto: UploadMusicDto,
  ) {
    const audioFile = files?.audio?.[0];
    if (!audioFile) throw new BadRequestException('An audio file is required');

    return this.musicService.upload(user.id, audioFile, dto, files?.artwork?.[0]);
  }

  // ── POST /music/:id/use ──────────────────────────────────────────────────
  @Post(':id/use')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  use(@Param('id') id: string) {
    return this.musicService.use(id);
  }

  // ── POST /music/:id/favorite ─────────────────────────────────────────────
  @Post(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  favorite(@CurrentUser() user: any, @Param('id') id: string) {
    return this.musicService.favorite(user.id, id);
  }

  // ── DELETE /music/:id/favorite ───────────────────────────────────────────
  @Delete(':id/favorite')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  unfavorite(@CurrentUser() user: any, @Param('id') id: string) {
    return this.musicService.unfavorite(user.id, id);
  }

  // ── GET /music/:id/posts  (song page content grid) ──────────────────────
  @Get(':id/posts')
  @UseGuards(OptionalJwtAuthGuard)
  getUsage(@Param('id') id: string, @Query('take') take?: string) {
    return this.musicService.getUsage(id, take ? parseInt(take) : 12);
  }

  // ── GET /music/:id  (song page) ──────────────────────────────────────────
  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.musicService.findOne(id, user?.id);
  }
}
