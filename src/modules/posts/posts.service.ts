// src/modules/posts/posts.service.ts

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
import { CreatePostDto } from './dto/create-post.dto';
import { PostType, FriendStatus } from '@prisma/client';

const execFileAsync = promisify(execFile);

@Injectable()
export class PostsService {
  private readonly logger = new Logger(PostsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ── POST /posts  (multipart upload) ──────────────────────────────────────

async create(
  userId: string,
  files: Express.Multer.File[] | Express.Multer.File,
  dto: Partial<CreatePostDto>,
) {
  const resolvedFiles = Array.isArray(files) ? files : [files];
  const primaryFile = resolvedFiles[0];
  const hasVideo = resolvedFiles.some((file) => file.mimetype.startsWith('video/'));
  const isVideo = hasVideo || primaryFile.mimetype.startsWith('video/');
  const folder = isVideo ? 'posts/videos' : 'posts/images';
  const resolvedMediaType = dto.mediaType ?? (isVideo ? 'video' : 'image');

  const uploadedMediaUrls = await Promise.all(
    resolvedFiles.map((file) =>
      this.storage.uploadBuffer(file.buffer, file.mimetype, folder),
    ),
  );

  const contentUrl =
    uploadedMediaUrls.length > 1
      ? JSON.stringify(uploadedMediaUrls)
      : uploadedMediaUrls[0];

  let thumbnailUrl: string | null = null;
  if (isVideo) {
    thumbnailUrl = await this._createVideoThumbnail(primaryFile.buffer);
  }

  const type: PostType = resolvedMediaType === 'video' ? PostType.video : PostType.image;

  return this.prisma.post.create({
    data: {
      userId,
      type,
      contentUrl,
      mediaType: resolvedMediaType,
      thumbnailUrl,
      caption: dto.caption ?? null,
      audience: dto.audience ?? 'everyone',
      locationTag: dto.locationTag ?? null,
    },
    select: this._postSelect(userId),
  });
}

// ── Share a Post ─────────────────────────────────────────────────────────
  async share(userId: string, postId: string) {
    await this._assertPostExists(postId);

    const existing = await this.prisma.share.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      // Unshare
      await this.prisma.$transaction([
        this.prisma.share.delete({ where: { userId_postId: { userId, postId } } }),
        this.prisma.post.update({
          where: { id: postId },
          data: { sharesCount: { decrement: 1 } },
        }),
      ]);
      return { shared: false };
    }

    await this.prisma.$transaction([
      this.prisma.share.create({ data: { userId, postId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { sharesCount: { increment: 1 } },
      }),
    ]);

    return { shared: true };
  }

  // ── Save / Unsave a Post ─────────────────────────────────────────────────
  async save(userId: string, postId: string) {
    await this._assertPostExists(postId);

    const existing = await this.prisma.savedPost.findUnique({
      where: { userId_postId: { userId, postId } },
    });

    if (existing) {
      // Unsave
      await this.prisma.$transaction([
        this.prisma.savedPost.delete({ where: { userId_postId: { userId, postId } } }),
        this.prisma.post.update({
          where: { id: postId },
          data: { savedCount: { decrement: 1 } },
        }),
      ]);
      return { saved: false };
    }

    await this.prisma.$transaction([
      this.prisma.savedPost.create({ data: { userId, postId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { savedCount: { increment: 1 } },
      }),
    ]);

    return { saved: true };
  }

  // ── Repost ─────────────────────────────────────────────────────
  async repost(userId: string, postId: string, caption?: string) {
    const post = await this._assertPostExists(postId);

    if (post.userId === userId) {
      throw new BadRequestException('You cannot repost your own post');
    }

    const existing = await this.prisma.repost.findUnique({
      where: { userId_originalPostId: { userId, originalPostId: postId } },
    });

    if (existing) {
      // Remove repost
      await this.prisma.$transaction([
        this.prisma.repost.delete({ where: { userId_originalPostId: { userId, originalPostId: postId } } }),
        this.prisma.post.update({
          where: { id: postId },
          data: { repostCount: { decrement: 1 } },
        }),
      ]);
      return { repost: false };
    }

    await this.prisma.$transaction([
      this.prisma.repost.create({
        data: { userId, originalPostId: postId, caption: caption ?? null },
      }),
      this.prisma.post.update({
        where: { id: postId },
        data: { repostCount: { increment: 1 } },
      }),
    ]);

    return { repost: true, caption };
  }

  // ── GET /posts/feed  (paginated, newest first) ────────────────────────────
  //
  // Two modes, depending on whether the caller is logged in:
  //
  //  • Logged-in (`viewerId` set) — personalized "following" feed. Merges
  //    two sources, newest-first, so a repost actually behaves like a
  //    TikTok repost instead of a silent bookmark:
  //      1. Original posts authored by you or people you follow.
  //      2. Posts *reshared* by people you follow (tagged with
  //         `repostedBy` so the client can show a "Reposted by @x" badge).
  //
  //  • Guest (`viewerId` undefined) — public discovery feed. No follow
  //    graph to work from, so this is just recent public ('everyone')
  //    posts, newest-first, with all interaction flags forced false by
  //    `_postSelect`. This is the TikTok-style "For You" feed a signed-out
  //    user sees before ever creating an account.
  //
  // Pagination cursor is just the ISO timestamp of the last item returned.

  async getFeed(
    viewerId?: string,
    cursor?: string,
    take = 20,
    filter: 'following' | 'forYou' | 'friends' = 'forYou',
  ) {
  const cursorDate = cursor ? new Date(cursor) : null;

  if (!viewerId) {
    // Guests only ever get the public For You feed, no matter what `filter`
    // the client sends — Following/Friends require a logged-in identity, and
    // the app's video tab hides those tabs for guests anyway (defense in
    // depth: this branch ignores `filter` entirely).
    const posts = await this.prisma.post.findMany({
      where: {
        audience: 'everyone',
        ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      select: this._postSelect(viewerId),
    });

    const hasNextPage = posts.length > take;
    const page = hasNextPage ? posts.slice(0, take) : posts;

    return {
      items: page.map((p) => ({ ...p, repostedBy: null })),
      nextCursor: hasNextPage
        ? page[page.length - 1].createdAt.toISOString()
        : null,
    };
  }

  // ── Resolve which authors count for this tab ────────────────────────────
  // null == no author restriction at all (For You: everyone's public posts).
  let authorIds: string[] | null = null;

  if (filter === 'following') {
    const following = await this.prisma.follow.findMany({
      where: { followerId: viewerId },
      select: { followingId: true },
    });
    authorIds = [viewerId, ...following.map((f) => f.followingId)];
  } else if (filter === 'friends') {
    const friendRows = await this.prisma.friend.findMany({
      where: {
        OR: [{ userId: viewerId }, { friendId: viewerId }],
        status: FriendStatus.accepted,
      },
      select: { userId: true, friendId: true },
    });
    const friendIds = friendRows.map((r) =>
      r.userId === viewerId ? r.friendId : r.userId,
    );
    authorIds = [viewerId, ...friendIds];
  }
  // filter === 'forYou' → authorIds stays null (everyone, ranked/global feed)

  const reposterSelect = {
    id: true,
    profile: {
      select: {
        username: true,
        handle: true,
        profilePhoto: true,
      },
    },
  };

  // Original posts
  const posts = await this.prisma.post.findMany({
    where: {
      ...(authorIds ? { userId: { in: authorIds } } : {}),
      audience: { not: 'only_me' },
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    select: this._postSelect(viewerId),
  });

  // Reposts
  // Include the viewer's own reposts (authorIds), not just followingIds —
  // otherwise a user who reposts a post never sees the "Reposted by" badge
  // on their own feed, even though it shows up correctly for their followers.
  const reposts = await this.prisma.repost.findMany({
    where: {
      ...(authorIds ? { userId: { in: authorIds } } : {}),
      originalPost: {
        audience: { not: 'only_me' },
      },
      ...(cursorDate ? { createdAt: { lt: cursorDate } } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: take + 1,
    select: {
      id: true,
      createdAt: true,
      user: {
        select: reposterSelect,
      },
      originalPost: {
        select: this._postSelect(viewerId),
      },
    },
  });

  const postEntries = posts.map((p) => ({
    feedAt: p.createdAt,
    post: p,
    repostedBy: null,
  }));

  const repostEntries = reposts.map((r) => ({
    feedAt: r.createdAt,
    post: r.originalPost,
    repostedBy: r.user,
  }));

  const merged = [...postEntries, ...repostEntries]
    .sort((a, b) => b.feedAt.getTime() - a.feedAt.getTime())
    .slice(0, take + 1);

  const hasNextPage = merged.length > take;
  const page = hasNextPage ? merged.slice(0, take) : merged;

  const items = page.map((e) => ({
    ...e.post,
    repostedBy: e.repostedBy,
  }));

  return {
    items,
    nextCursor: hasNextPage
      ? page[page.length - 1].feedAt.toISOString()
      : null,
  };
}

  // ── GET /posts/user/:userId  (a user's public posts) ─────────────────────

  async getUserPosts(viewerId: string, targetUserId: string, cursor?: string, take = 20) {
    const posts = await this.prisma.post.findMany({
      where: {
        userId: targetUserId,
        // If viewing own profile, show all; otherwise exclude private
        audience: viewerId === targetUserId ? undefined : { not: 'only_me' },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: this._postSelect(viewerId),
    });

    const hasNextPage = posts.length > take;
    const items = hasNextPage ? posts.slice(0, take) : posts;

    return {
      items,
      nextCursor: hasNextPage ? items[items.length - 1].id : null,
    };
  }

  // ── GET /posts/:id ────────────────────────────────────────────────────────
  // viewerId is optional — guests (OptionalJwtAuthGuard) can open a single
  // post with no token; _postSelect falls back to the sentinel filter so
  // likedByMe/savedByMe/etc. just come back false.

  async findOne(viewerId: string | undefined, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: this._postSelect(viewerId),
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }

  // ── DELETE /posts/:id ─────────────────────────────────────────────────────

  async delete(userId: string, postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { userId: true, contentUrl: true, thumbnailUrl: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.userId !== userId) throw new ForbiddenException();

    // Best-effort S3 cleanup — never throw if it fails
    if (post.contentUrl) {
      await this.storage.deleteByUrl(post.contentUrl);
    }
    if (post.thumbnailUrl) {
      await this.storage.deleteByUrl(post.thumbnailUrl);
    }

    await this.prisma.post.delete({ where: { id: postId } });
    return { deleted: true };
  }

  // ── POST /posts/:id/like ──────────────────────────────────────────────────

  async like(userId: string, postId: string) {
    await this._assertPostExists(postId);

    const existing = await this.prisma.postLike.findUnique({
      where: { postId_userId: { postId, userId } },
    });

    if (existing) {
      // toggle off
      await this.prisma.$transaction([
        this.prisma.postLike.delete({
          where: { postId_userId: { postId, userId } },
        }),
        this.prisma.post.update({
          where: { id: postId },
          data: { likesCount: { decrement: 1 } },
        }),
      ]);
      return { liked: false };
    }

    await this.prisma.$transaction([
      this.prisma.postLike.create({ data: { postId, userId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { likesCount: { increment: 1 } },
      }),
    ]);
    return { liked: true };
  }

  // ── GET /posts/:id/comments ───────────────────────────────────────────────
  // Already viewer-agnostic — no auth required to read.

async getComments(postId: string, cursor?: string, take = 30) {
  await this._assertPostExists(postId);

  const comments = await this.prisma.postComment.findMany({
    where: { postId },
    orderBy: { createdAt: 'asc' },
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: {
        select: {
          id: true,
          profile: {
            select: {
              username: true,
              handle: true,
              profilePhoto: true,
            },
          },
        },
      },
    },
  });

  const hasNextPage = comments.length > take;
  const items = hasNextPage ? comments.slice(0, take) : comments;

  return {
    items,
    nextCursor: hasNextPage ? items[items.length - 1].id : null,
  };
}
  // ── POST /posts/:id/comments ──────────────────────────────────────────────

async addComment(userId: string, postId: string, body: string) {
  await this._assertPostExists(postId);

  const [comment] = await this.prisma.$transaction([
    this.prisma.postComment.create({
      data: {
        postId,
        userId,
        body,
      },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: {
          select: {
            id: true,
            profile: {
              select: {
                username: true,
                handle: true,
                profilePhoto: true,
              },
            },
          },
        },
      },
    }),
    this.prisma.post.update({
      where: { id: postId },
      data: {
        commentsCount: {
          increment: 1,
        },
      },
    }),
  ]);

  return comment;
}

  // ── DELETE /posts/:id/comments/:commentId ─────────────────────────────────

  async deleteComment(userId: string, postId: string, commentId: string) {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
      select: { userId: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.userId !== userId) throw new ForbiddenException();

    await this.prisma.$transaction([
      this.prisma.postComment.delete({ where: { id: commentId } }),
      this.prisma.post.update({
        where: { id: postId },
        data: { commentsCount: { decrement: 1 } },
      }),
    ]);
    return { deleted: true };
  }

  // ── GET /posts/my-repost  → Current user's own repost ─────────────────
  async getMyRepost(userId: string, cursor?: string, take = 20) {
    const repost = await this.prisma.repost.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        originalPost: {
          select: this._postSelect(userId),   // Full post data with interaction status
        },
      },
    });

    const posts = repost.map((r) => r.originalPost);

    const hasNextPage = repost.length > take;
    const items = hasNextPage ? posts.slice(0, take) : posts;

    return {
      items,
      nextCursor: hasNextPage ? repost[repost.length - 1].id : null,
    };
  }

  // ── GET /posts/user/:userId/reshares  → A user's reposts ─────────────────
  async getUserRepost(viewerId: string, targetUserId: string, cursor?: string, take = 20) {
    const repost = await this.prisma.repost.findMany({
      where: { userId: targetUserId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        originalPost: {
          select: this._postSelect(viewerId),
        },
      },
    });

    const posts = repost.map((r) => r.originalPost);

    const hasNextPage = repost.length > take;
    const items = hasNextPage ? posts.slice(0, take) : posts;

    return {
      items,
      nextCursor: hasNextPage ? repost[repost.length - 1].id : null,
    };
  }

  // ── GET /posts/saved  → User's saved posts ────────────────────────────────
  async getSavedPosts(viewerId: string, cursor?: string, take = 20) {
    const savedPosts = await this.prisma.savedPost.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        post: {
          select: this._postSelect(viewerId),
        },
      },
    });

    const posts = savedPosts.map((sp) => sp.post);

    const hasNextPage = savedPosts.length > take;
    const items = hasNextPage ? posts.slice(0, take) : posts;

    return {
      items,
      nextCursor: hasNextPage ? savedPosts[savedPosts.length - 1].id : null,
    };
  }

  // ── GET /posts/liked  → User's liked posts ────────────────────────────────
  async getLikedPosts(viewerId: string, cursor?: string, take = 20) {
    const likedPosts = await this.prisma.postLike.findMany({
      where: { userId: viewerId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { postId_userId: { postId: cursor, userId: viewerId } }, skip: 1 } : {}),
      include: {
        post: {
          select: this._postSelect(viewerId),
        },
      },
    });

    const posts = likedPosts.map((lp) => lp.post);

    const hasNextPage = likedPosts.length > take;
    const items = hasNextPage ? posts.slice(0, take) : posts;

    return {
      items,
      nextCursor: hasNextPage ? likedPosts[take - 1].postId : null,
    };
  }

  // ── GET /posts/:id/reshare  → Who reshared this post ─────────────────────
  async getRepostOfPost(postId: string, cursor?: string, take = 20) {
    await this._assertPostExists(postId);

    const repost = await this.prisma.repost.findMany({
      where: { originalPostId: postId },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                username: true,
                handle: true,
                profilePhoto: true,
              },
            },
          },
        },
      },
    });

    const hasNextPage = repost.length > take;
    const items = hasNextPage ? repost.slice(0, take) : repost;

    return {
      items: items.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        caption: r.caption,
        user: r.user,
      })),
      nextCursor: hasNextPage ? items[items.length - 1].id : null,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async _createVideoThumbnail(fileBuffer: Buffer): Promise<string | null> {
    try {
      const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'globecart-post-'));
      const inputPath = path.join(tempDir, 'input.mp4');
      const outputPath = path.join(tempDir, 'thumb.png');

      try {
        await fs.writeFile(inputPath, fileBuffer);
        await execFileAsync(
          'ffmpeg',
          [
            '-y',
            '-i',
            inputPath,
            '-ss',
            '00:00:01',
            '-frames:v',
            '1',
            '-vf',
            'scale=720:-1',
            outputPath,
          ],
          { timeout: 30_000 },
        );

        const thumbnailBuffer = await fs.readFile(outputPath);
        return this.storage.uploadBuffer(
          thumbnailBuffer,
          'image/png',
          'posts/thumbnails',
        );
      } finally {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    } catch (err: any) {
      // Previously this swallowed every failure silently, so a missing
      // ffmpeg binary or a transcoding error would just produce
      // thumbnailUrl: null with zero trace in the logs. Surface it instead.
      const reason =
        err?.code === 'ENOENT'
          ? 'ffmpeg binary not found on PATH — is ffmpeg installed in this environment?'
          : err?.stderr || err?.message || String(err);
      this.logger.error(`Video thumbnail generation failed: ${reason}`);
      return null;
    }
  }

  // viewerId is optional so guest requests (no JWT) can still select posts —
  // when it's undefined we filter the per-viewer relations (likes, shares,
  // savedPosts, repost) on a sentinel id that can never match a real user,
  // instead of `userId: undefined`. Prisma drops `undefined` keys from a
  // `where` clause entirely, which would turn `{ userId: undefined }` into
  // "no filter" — i.e. `likedByMe` would come back true for a guest the
  // instant *anyone* had liked the post. The sentinel avoids that.
  private _postSelect(viewerId?: string) {
    const viewerFilter = { userId: viewerId ?? '__no_viewer__' };
    return {
      id: true,
      contentUrl: true,
      mediaType: true,
      thumbnailUrl: true,
      caption: true,
      audience: true,
      locationTag: true,
      likesCount: true,
      commentsCount: true,
      sharesCount: true,      // ← Added
      savedCount: true,       // ← Added
      repostCount: true,    // ← Added
      createdAt: true,

      author: {
        select: {
          id: true,
          profile: {
            select: {
              username: true,
              handle: true,
              profilePhoto: true,
            },
          },
        },
      },

      // Interaction status for current viewer (always empty for guests)
      likes: {
        where: viewerFilter,
        select: { userId: true },
        take: 1,
      },
      shares: {
        where: viewerFilter,
        select: { userId: true },
        take: 1,
      },
      savedPosts: {
        where: viewerFilter,
        select: { userId: true },
        take: 1,
      },
      repost: {
        where: viewerFilter,
        select: { userId: true },
        take: 1,
      },
    };
  }

  private async _assertPostExists(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, userId: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    return post;
  }
}