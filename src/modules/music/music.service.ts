// src/modules/music/music.service.ts
//
// Single shared Music library used by personal Posts, personal Stories,
// BusinessPosts and BusinessStories (see schema.prisma). Everything here
// is additive to the existing backend — no existing model, relation, or
// endpoint is touched.

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
import { Music, MusicSource, MusicStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { UploadMusicDto } from './dto/upload-music.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── GET /music  (paginated library, newest first) ─────────────────────────

  async list(cursor?: string, take = 20, source?: MusicSource) {
    const cursorDate = cursor ? new Date(cursor) : null;

    const items = await this.prisma.music.findMany({
      where: {
        status: MusicStatus.ready,
        ...(source ? { source } : {}),
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: this._musicSelect(),
    });

    return this._paginate(items, take, (m) => m.createdAt.toISOString());
  }

  // ── GET /music/trending ────────────────────────────────────────────────────
  // Ranked by useCount (how many posts/stories currently reference the
  // track), tie-broken by playCount. No time-decay window yet — that's a
  // natural place to plug in a recency-weighted score later without
  // touching the schema (see "Future Scalability").

  async trending(take = 20) {
    return this.prisma.music.findMany({
      where: { status: MusicStatus.ready },
      orderBy: [{ useCount: 'desc' }, { playCount: 'desc' }],
      take,
      select: this._musicSelect(),
    });
  }

  // ── GET /music/search?q= ───────────────────────────────────────────────────

  async search(q: string, cursor?: string, take = 20) {
    const cursorDate = cursor ? new Date(cursor) : null;
    const query = q.trim();
    if (!query) return { items: [], nextCursor: null };

    const items = await this.prisma.music.findMany({
      where: {
        status: MusicStatus.ready,
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { artist: { contains: query, mode: 'insensitive' } },
          { album: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: this._musicSelect(),
    });

    return this._paginate(items, take, (m) => m.createdAt.toISOString());
  }

  // ── GET /music/:id  (song page) ────────────────────────────────────────────

  async findOne(id: string, viewerId?: string) {
    const music = await this.prisma.music.findUnique({
      where: { id },
      select: {
        ...this._musicSelect(),
        _count: {
          select: { posts: true, stories: true, businessPosts: true, businessStories: true },
        },
        favorites: viewerId
          ? { where: { userId: viewerId }, select: { userId: true }, take: 1 }
          : false,
      },
    });
    if (!music) throw new NotFoundException('Music not found');

    const { _count, favorites, ...rest } = music as any;
    return {
      ...rest,
      totalVideos: _count.posts,
      totalStories: _count.stories,
      totalBusinessPosts: _count.businessPosts,
      totalBusinessStories: _count.businessStories,
      favoritedByMe: viewerId ? (favorites?.length ?? 0) > 0 : false,
    };
  }

  // ── GET /music/:id/posts  (song page content grid) ─────────────────────────
  // Returns everything currently using this sound, grouped by content type,
  // each with its own small cursor. Kept as three independent lists rather
  // than one merged feed — a song page's tabs (Videos / Stories / Business)
  // page independently in the TikTok UI this is modeled on.

  async getUsage(musicId: string, take = 12) {
    await this._assertMusicExists(musicId);

    const [posts, stories, businessPosts, businessStories] = await Promise.all([
      this.prisma.post.findMany({
        where: { musicId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          contentUrl: true,
          thumbnailUrl: true,
          mediaType: true,
          caption: true,
          likesCount: true,
          createdAt: true,
          author: {
            select: { id: true, profile: { select: { username: true, handle: true, profilePhoto: true } } },
          },
        },
      }),
      this.prisma.story.findMany({
        where: { musicId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          contentUrl: true,
          mediaType: true,
          createdAt: true,
          expiresAt: true,
          user: {
            select: { id: true, profile: { select: { username: true, handle: true, profilePhoto: true } } },
          },
        },
      }),
      this.prisma.businessPost.findMany({
        where: { musicId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          contentUrl: true,
          caption: true,
          createdAt: true,
          business: { select: { id: true, name: true, logoPhoto: true } },
        },
      }),
      this.prisma.businessStory.findMany({
        where: { musicId },
        orderBy: { createdAt: 'desc' },
        take,
        select: {
          id: true,
          contentUrl: true,
          createdAt: true,
          expiresAt: true,
          business: { select: { id: true, name: true, logoPhoto: true } },
        },
      }),
    ]);

    return { posts, stories, businessPosts, businessStories };
  }

  // ── POST /music/upload ─────────────────────────────────────────────────────
  // User-uploaded sound. Also the entry point used internally when a
  // creator posts a video/story with "use my own audio" — see
  // createOriginalSound() below, which PostsService/StoriesService call
  // directly (skipping the HTTP layer) with the audio track extracted
  // from the uploaded clip.

  async upload(
    userId: string,
    audioFile: Express.Multer.File,
    dto: UploadMusicDto,
    artworkFile?: Express.Multer.File,
  ): Promise<Music> {
    if (!audioFile) {
      throw new BadRequestException('An audio file is required');
    }

    const [audioUrl, artworkUrl, duration] = await Promise.all([
      this.storage.uploadMusicAudio(audioFile),
      artworkFile ? this.storage.uploadMusicArtwork(artworkFile) : Promise.resolve(null),
      this._probeDuration(audioFile.buffer),
    ]);

    const source = dto.source ?? MusicSource.original;
    let artist = dto.artist?.trim();
    if (!artist) {
      if (source === MusicSource.original) {
        const handle = await this._resolveHandle(userId);
        artist = handle ? `@${handle}` : 'Unknown artist';
      } else {
        artist = 'Unknown artist';
      }
    }

    return this.prisma.music.create({
      data: {
        title: dto.title.trim(),
        artist,
        album: dto.album?.trim() || null,
        artworkUrl,
        audioUrl,
        duration,
        source,
        status: MusicStatus.ready,
        uploadedById: userId,
      },
    });
  }

  // ── Original Sound auto-creation ────────────────────────────────────────
  // Called by PostsService/StoriesService (not exposed over HTTP) right
  // after a video upload when the creator chose to use their own clip's
  // audio rather than picking an existing track. Produces a Music row
  // titled "Original sound - @username" that other users can then browse
  // to and tap "Use this sound" on, same as any library track.

  async createOriginalSound(
    userId: string,
    audioBuffer: Buffer,
    mimeType: string,
  ): Promise<Music> {
    const handle = (await this._resolveHandle(userId)) ?? 'user';
    const [audioUrl, duration] = await Promise.all([
      this.storage.uploadMusicAudio({
        buffer: audioBuffer,
        mimetype: mimeType,
      } as Express.Multer.File),
      this._probeDuration(audioBuffer),
    ]);

    return this.prisma.music.create({
      data: {
        title: `Original sound - @${handle}`,
        artist: `@${handle}`,
        audioUrl,
        duration,
        source: MusicSource.original,
        status: MusicStatus.ready,
        uploadedById: userId,
      },
    });
  }

  // ── POST /music/:id/use ─────────────────────────────────────────────────
  // Called both from the controller (explicit "use this sound" tap before
  // the creator has finished composing their post) and internally by
  // PostsService/StoriesService.create() once a post/story referencing the
  // track is actually saved. Both increment the same counter — calling it
  // twice for one eventual post is an acceptable trade-off for TikTok-style
  // "N videos use this sound" numbers that update immediately on tap.

  async use(musicId: string): Promise<{ useCount: number }> {
    const music = await this.prisma.music.update({
      where: { id: musicId },
      data: { useCount: { increment: 1 } },
      select: { useCount: true },
    }).catch(() => null);

    if (!music) throw new NotFoundException('Music not found');
    return music;
  }

  async assertUsable(musicId: string): Promise<Music> {
    const music = await this.prisma.music.findUnique({ where: { id: musicId } });
    if (!music) throw new NotFoundException('Music not found');
    if (music.status === MusicStatus.blocked) {
      throw new ForbiddenException('This sound is no longer available');
    }
    return music;
  }

  // ── POST /music/:id/favorite & DELETE /music/:id/favorite ────────────────

  async favorite(userId: string, musicId: string) {
    await this._assertMusicExists(musicId);

    const existing = await this.prisma.musicFavorite.findUnique({
      where: { userId_musicId: { userId, musicId } },
    });
    if (existing) return { favorited: true };

    await this.prisma.$transaction([
      this.prisma.musicFavorite.create({ data: { userId, musicId } }),
      this.prisma.music.update({
        where: { id: musicId },
        data: { favoriteCount: { increment: 1 } },
      }),
    ]);
    return { favorited: true };
  }

  async unfavorite(userId: string, musicId: string) {
    const existing = await this.prisma.musicFavorite.findUnique({
      where: { userId_musicId: { userId, musicId } },
    });
    if (!existing) return { favorited: false };

    await this.prisma.$transaction([
      this.prisma.musicFavorite.delete({
        where: { userId_musicId: { userId, musicId } },
      }),
      this.prisma.music.update({
        where: { id: musicId },
        data: { favoriteCount: { decrement: 1 } },
      }),
    ]);
    return { favorited: false };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private _musicSelect() {
    return {
      id: true,
      title: true,
      artist: true,
      album: true,
      artworkUrl: true,
      audioUrl: true,
      duration: true,
      source: true,
      status: true,
      uploadedById: true,
      playCount: true,
      useCount: true,
      favoriteCount: true,
      createdAt: true,
      updatedAt: true,
    } satisfies Prisma.MusicSelect;
  }

  private _paginate<T>(rows: T[], take: number, cursorOf: (row: T) => string) {
    const hasNextPage = rows.length > take;
    const page = hasNextPage ? rows.slice(0, take) : rows;
    return {
      items: page,
      nextCursor: hasNextPage ? cursorOf(page[page.length - 1]) : null,
    };
  }

  private async _resolveHandle(userId: string): Promise<string | null> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
      select: { handle: true },
    });
    return profile?.handle?.replace(/^@/, '') ?? null;
  }

  private async _assertMusicExists(musicId: string) {
    const music = await this.prisma.music.findUnique({
      where: { id: musicId },
      select: { id: true },
    });
    if (!music) throw new NotFoundException('Music not found');
    return music;
  }

  // Duration probe via ffprobe (ships alongside the ffmpeg binary
  // PostsService already relies on for video thumbnails). Best-effort:
  // falls back to 0 rather than failing the upload if ffprobe is missing
  // or the file can't be parsed — duration is informational, not
  // load-bearing for playback.
  private async _probeDuration(buffer: Buffer): Promise<number> {
    try {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'globecart-music-'));
      const inputPath = path.join(tempDir, 'input.audio');
      try {
        await fs.writeFile(inputPath, buffer);
        const { stdout } = await execFileAsync(
          'ffprobe',
          [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            inputPath,
          ],
          { timeout: 15_000 },
        );
        const seconds = parseFloat(stdout.trim());
        return Number.isFinite(seconds) ? Math.round(seconds) : 0;
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (err: any) {
      const reason =
        err?.code === 'ENOENT'
          ? 'ffprobe binary not found on PATH'
          : err?.stderr || err?.message || String(err);
      this.logger.warn(`Music duration probe failed, defaulting to 0: ${reason}`);
      return 0;
    }
  }
}