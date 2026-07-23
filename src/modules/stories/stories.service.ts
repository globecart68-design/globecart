// src/modules/stories/stories.service.ts

import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateStoryDto } from './dto/create-story.dto';
import { MusicService } from '../music/music.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class StoriesService {
  private readonly logger = new Logger(StoriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly musicService: MusicService,
  ) {}

  // ─────────────────────────────────────────────
  // GET /stories/feed
  // Active stories from users I follow + my own
  // ─────────────────────────────────────────────

  async getFeed(viewerId: string) {
    console.log('viewerId =', viewerId);
  console.log('typeof viewerId =', typeof viewerId);
    const now = new Date();

    const following = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });

    const authorIds = [viewerId, ...following.map((f) => f.followingId)];

    const stories = await this.prisma.story.findMany({
      where: {
        userId: { in: authorIds },
        expiresAt: { gt: now },
      },
      // FIX: oldest first so story index 0 is always the first story posted
      // (matches viewer progress bar assumption)
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                handle: true,
                username: true,
                profilePhoto: true,
              },
            },
          },
        },
        views: {
          where: { viewerId },
          select: { id: true },
        },
        music: {
          select: { id: true, title: true, artist: true, artworkUrl: true },
        },
      },
    });

    return stories.map((s) => this.toDto(s, s.views.length > 0));
  }

  // ─────────────────────────────────────────────
  // POST /stories
  // Create story — image upload OR text card
  // ─────────────────────────────────────────────

  async create(
    userId: string,
    dto: CreateStoryDto,
    file?: Express.Multer.File,
  ) {
    // Must have either an uploaded file, a contentUrl, or textContent
    if (!file && !dto.contentUrl && !dto.textContent) {
      throw new BadRequestException(
        'Provide an image file, a contentUrl, or textContent for a text card.',
      );
    }

    // Enforce per-type size limits (multer only enforces MAX_VIDEO_SIZE globally)
    if (file) {
      const isVideo = file.mimetype.startsWith('video/');
      const limit = isVideo
        ? 200 * 1024 * 1024  // 200 MB for video
        : 20 * 1024 * 1024;  //  20 MB for images
      if (file.size > limit) {
        throw new BadRequestException(
          `File too large. Max size for ${isVideo ? 'video' : 'image'} is ${isVideo ? '200' : '20'} MB.`,
        );
      }
    }

    let contentUrl: string | null = dto.contentUrl ?? null;
    let mediaType: 'image' | 'video' | 'text' = 'text';

    if (file) {
      contentUrl = await this.storage.uploadStory(file);
      mediaType = file.mimetype.startsWith('video/') ? 'video' : 'image';
    } else if (dto.contentUrl) {
      // Prefer explicitly declared mediaType, fall back to extension guessing
      if (dto.mediaType) {
        mediaType = dto.mediaType;
      } else {
        const ext = dto.contentUrl.split('?')[0].split('.').pop()?.toLowerCase();
        mediaType = ['mp4', 'mov', 'avi', 'm4v', 'mkv'].includes(ext ?? '')
          ? 'video'
          : 'image';
      }
    }

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

    // ── Music resolution (same pattern as PostsService.create) ────────────
    let musicId: string | null = null;

    if (dto.musicId) {
      await this.musicService.assertUsable(dto.musicId);
      musicId = dto.musicId;
    } else if (dto.useOriginalAudio && file && mediaType === 'video') {
      const audioBuffer = await this._extractAudioTrack(file.buffer);
      if (audioBuffer) {
        const original = await this.musicService.createOriginalSound(
          userId,
          audioBuffer,
          'audio/mp4',
        );
        musicId = original.id;
      } else {
        this.logger.warn('useOriginalAudio requested but audio extraction failed; posting story without music');
      }
    }

    if (musicId) {
      await this.musicService.use(musicId).catch(() => null);
    }

    const story = await this.prisma.story.create({
      data: {
        userId,
        contentUrl,
        textContent: dto.textContent ?? null,
        backgroundColor: dto.backgroundColor ?? null,
        mediaType,   // NEW: 'image' | 'video' | 'text'
        expiresAt,
        musicId,
        musicStart: musicId ? dto.musicStart ?? 0 : null,
        musicDuration: musicId ? dto.musicDuration ?? null : null,
        musicVolume: musicId ? dto.musicVolume ?? 1.0 : null,
      },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: { handle: true, username: true, profilePhoto: true },
            },
          },
        },
        music: {
          select: { id: true, title: true, artist: true, artworkUrl: true },
        },
      },
    });

    return this.toDto(story as any, false);
  }

  // ─────────────────────────────────────────────
  // POST /stories/:id/view
  // Mark a story as viewed (idempotent)
  // ─────────────────────────────────────────────

  async markViewed(storyId: string, viewerId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true, expiresAt: true },
    });

    if (!story) throw new NotFoundException('Story not found');
    if (story.expiresAt < new Date()) {
      throw new BadRequestException('Story has expired');
    }
    // Don't count the author viewing their own story
    if (story.userId === viewerId) {
      return { ok: true };
    }

    await this.prisma.storyView.upsert({
      where: { storyId_viewerId: { storyId, viewerId } },
      create: { storyId, viewerId },
      update: {},
    });

    return { ok: true };
  }

  // ─────────────────────────────────────────────
  // DELETE /stories/:id
  // Delete own story + S3 cleanup
  // ─────────────────────────────────────────────

  async delete(storyId: string, userId: string) {
    const story = await this.prisma.story.findUnique({
      where: { id: storyId },
      select: { id: true, userId: true, contentUrl: true },
    });

    if (!story) throw new NotFoundException('Story not found');
    if (story.userId !== userId) throw new ForbiddenException();

    await this.prisma.story.delete({ where: { id: storyId } });

    // Best-effort S3 cleanup
    if (story.contentUrl) {
      await this.storage
        .deleteFile(story.contentUrl)
        .catch(() => null);
    }

    return { ok: true };
  }

  // ─────────────────────────────────────────────
  // GET /stories/presign
  // Pre-signed S3 PUT URL for direct Flutter upload
  // ─────────────────────────────────────────────

  async getPresignedUrl(
    userId: string,
    filename: string,
    mimeType: string,
    fileSize?: number,
  ) {
    return this.storage.presignStoryUpload(
      userId,
      filename,
      mimeType,
      fileSize,
    );
  }

  // ─────────────────────────────────────────────
  // GET /stories/my
  // Own stories with viewer list (author view)
  // ─────────────────────────────────────────────

  async getMyStories(userId: string) {
    const now = new Date();

    const stories = await this.prisma.story.findMany({
      where: { userId, expiresAt: { gt: now } },
      orderBy: { createdAt: 'asc' },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                handle: true,
                username: true,
                profilePhoto: true,
              },
            },
          },
        },
        views: {
          include: {
            viewer: {
              select: {
                id: true,
                profile: {
                  select: {
                    handle: true,
                    username: true,
                    profilePhoto: true,
                  },
                },
              },
            },
          },
        },
        _count: { select: { views: true } },
        music: {
          select: { id: true, title: true, artist: true, artworkUrl: true },
        },
      },
    });

    // Map through toDto so the shape is consistent with getFeed,
    // then attach the full viewer list on top.
    return stories.map((s) => ({
      ...this.toDto(s, true),
      viewCount: s._count.views,
      viewers: s.views.map((v) => ({
        viewedAt: (v as any).createdAt ?? null,
        viewer: {
          id: v.viewer.id,
          handle: v.viewer.profile?.handle ?? 'unknown',
          username: v.viewer.profile?.username ?? '',
          profilePhoto: v.viewer.profile?.profilePhoto ?? null,
        },
      })),
    }));
  }

  // ─────────────────────────────────────────────
  // Helper
  // ─────────────────────────────────────────────

  private async _extractAudioTrack(videoBuffer: Buffer): Promise<Buffer | null> {
    try {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'globecart-story-audio-'));
      const inputPath = path.join(tempDir, 'input.mp4');
      const outputPath = path.join(tempDir, 'audio.m4a');

      try {
        await fs.writeFile(inputPath, videoBuffer);
        await execFileAsync(
          'ffmpeg',
          ['-y', '-i', inputPath, '-vn', '-acodec', 'aac', '-b:a', '128k', outputPath],
          { timeout: 30_000 },
        );
        return await fs.readFile(outputPath);
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (err: any) {
      const reason =
        err?.code === 'ENOENT'
          ? 'ffmpeg binary not found on PATH'
          : err?.stderr || err?.message || String(err);
      this.logger.error(`Audio track extraction failed: ${reason}`);
      return null;
    }
  }

  private toDto(
    story: {
      id: string;
      userId: string;
      contentUrl: string | null;
      textContent: string | null;
      backgroundColor: string | null;
      mediaType: string;          // 'image' | 'video' | 'text'
      expiresAt: Date;
      createdAt: Date;
      musicStart?: number | null;
      musicDuration?: number | null;
      musicVolume?: number | null;
      music?: { id: string; title: string; artist: string; artworkUrl: string | null } | null;
      user: {
        id: string;
        profile: {
          handle: string;
          username: string;
          profilePhoto: string | null;
        } | null;
      };
      // views may be full objects (getMyStories) or just [{id}] (getFeed)
      views?: { id: string }[];
    },
    viewedByMe: boolean,
  ) {
    const nowMs = Date.now();
    const expiresInSeconds = Math.max(
      0,
      Math.floor((story.expiresAt.getTime() - nowMs) / 1000),
    );

    return {
      id: story.id,
      userId: story.userId,
      contentUrl: story.contentUrl,
      textContent: story.textContent,
      backgroundColor: story.backgroundColor,
      mediaType: story.mediaType,           // NEW: lets client know image vs video vs text
      expiresAt: story.expiresAt,
      expiresInSeconds,                     // NEW: handy for countdown UI
      createdAt: story.createdAt,
      viewedByMe,
      viewCount: story.views?.length ?? 0,  // NEW: viewer count on own stories
      // Music (NEW)
      music: story.music ?? null,
      musicStart: story.musicStart ?? null,
      musicDuration: story.musicDuration ?? null,
      musicVolume: story.musicVolume ?? null,
      author: {
        id: story.user.id,
        // FIX: null profile guard — avoids empty handle causing StoryRing crash
        handle: story.user.profile?.handle ?? 'unknown',
        username: story.user.profile?.username ?? '',
        profilePhoto: story.user.profile?.profilePhoto ?? null,
      },
    };
  }
}