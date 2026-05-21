import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class SocialService {
  constructor(private readonly prisma: PrismaService) {}

  // ─────────────────────────────────────────────
  // Follow user
  // ─────────────────────────────────────────────

  async follow(followerId: string, followingId: string) {
    if (followerId === followingId) {
      throw new BadRequestException('You cannot follow yourself.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: followingId },
      select: { id: true },
    });

    if (!target) {
      throw new NotFoundException('User not found.');
    }

    await this.prisma.follow.upsert({
      where: {
        followerId_followingId: { followerId, followingId },
      },
      create: { followerId, followingId },
      update: {},
    });

    return {
      success: true,
      message: 'Followed successfully.',
    };
  }

  // ─────────────────────────────────────────────
  // Unfollow user
  // ─────────────────────────────────────────────

  async unfollow(followerId: string, followingId: string) {
  const existing = await this.prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId, followingId },
    },
  });

  if (!existing) {
    throw new NotFoundException('You are not following this user.');
  }

  // Remove the follow
  await this.prisma.follow.delete({
    where: {
      followerId_followingId: { followerId, followingId },
    },
  });

  // If a friendship exists between these two, remove it too —
  // friendship requires mutual follow, so it can no longer stand
  await this.prisma.friend.deleteMany({
    where: {
      OR: [
        { userId: followerId, friendId: followingId },
        { userId: followingId, friendId: followerId },
      ],
    },
  });

  return {
    success: true,
    message: 'Unfollowed successfully.',
  };
}
  // ─────────────────────────────────────────────
  // Follow status checker
  // ─────────────────────────────────────────────

  async getFollowStatus(userId: string, targetUserId: string) {
  if (userId === targetUserId) {
    return {
      isFollowing: false,
      isFollowedBack: false,
      isMutual: false,
    };
  }

  const [isFollowing, isFollowedBack] = await Promise.all([
    this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: userId,
          followingId: targetUserId,
        },
      },
    }),

    this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: targetUserId,
          followingId: userId,
        },
      },
    }),
  ]);

  return {
    isFollowing: !!isFollowing,
    isFollowedBack: !!isFollowedBack,
    isMutual: !!isFollowing && !!isFollowedBack,
  };
}

  // ─────────────────────────────────────────────
  // Followers list
  // ─────────────────────────────────────────────

  async getFollowers(userId: string) {
    const rows = await this.prisma.follow.findMany({
      where: {
        followingId: userId,
      },
      include: {
        follower: {
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rows.map((row) => ({
      id: row.follower.id,
      username: row.follower.profile?.username,
      handle: row.follower.profile?.handle,
      profilePhoto: row.follower.profile?.profilePhoto,
    }));
  }

  // ─────────────────────────────────────────────
  // Following list
  // ─────────────────────────────────────────────

  async getFollowing(userId: string) {
    const rows = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
      },
      include: {
        following: {
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
      orderBy: {
        createdAt: 'desc',
      },
    });

    return rows.map((row) => ({
      id: row.following.id,
      username: row.following.profile?.username,
      handle: row.following.profile?.handle,
      profilePhoto: row.following.profile?.profilePhoto,
    }));
  }

  // ─────────────────────────────────────────────
  // Suggested users (not followed yet)
  // ─────────────────────────────────────────────

  async getSuggestedUsers(userId: string) {
    const followingRows = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
      },
      select: {
        followingId: true,
      },
    });

    const excludedUserIds = [
      userId,
      ...followingRows.map((row) => row.followingId),
    ].filter(Boolean);

    const users = await this.prisma.user.findMany({
      where: {
        id: {
          notIn: excludedUserIds.length
            ? excludedUserIds
            : undefined,
        },
        profile: {
          isNot: null,
        },
      },
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
      orderBy: {
        createdAt: 'desc',
      },
      take: 8,
    });

    return users.map((user) => ({
      id: user.id,
      username: user.profile?.username,
      handle: user.profile?.handle,
      profilePhoto: user.profile?.profilePhoto,
    }));
  }

  // ─────────────────────────────────────────────
  // Mutual follows (Instagram-style friends)
  // ─────────────────────────────────────────────

  async getMutualFollows(userId: string) {
    const rows = await this.prisma.follow.findMany({
      where: {
        followerId: userId,
        following: {
          followers: {
            some: {
              followingId: userId,
            },
          },
        },
      },
      include: {
        following: {
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

    return {
      count: rows.length,
      users: rows.map((row) => ({
        id: row.following.id,
        username: row.following.profile?.username,
        handle: row.following.profile?.handle,
        profilePhoto: row.following.profile?.profilePhoto,
      })),
    };
  }
}