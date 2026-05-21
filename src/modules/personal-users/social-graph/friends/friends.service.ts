import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FriendStatus } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class FriendsService {
  constructor(private readonly prisma: PrismaService) {}

  async sendRequest(userId: string, targetUserId: string) {
    if (userId === targetUserId) {
      throw new BadRequestException('You cannot add yourself as a friend.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found.');

    const [iFollowThem, theyFollowMe] = await Promise.all([
      this.prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId: userId, followingId: targetUserId },
        },
      }),
      this.prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId: targetUserId, followingId: userId },
        },
      }),
    ]);

    if (!iFollowThem || !theyFollowMe) {
      throw new BadRequestException(
        'You must follow each other before sending a friend request.',
      );
    }

    const existing = await this.prisma.friend.findFirst({
      where: {
        OR: [
          { userId, friendId: targetUserId },
          { userId: targetUserId, friendId: userId },
        ],
      },
    });

    if (existing) {
      if (existing.status === FriendStatus.accepted) {
        throw new ConflictException('You are already friends.');
      }
      if (existing.status === FriendStatus.pending) {
        throw new ConflictException('A friend request is already pending.');
      }
      if (existing.userId === userId) {
        return this.prisma.friend.update({
          where: { id: existing.id },
          data: { status: FriendStatus.pending },
        });
      } else {
        await this.prisma.friend.delete({ where: { id: existing.id } });
        return this.prisma.friend.create({
          data: { userId, friendId: targetUserId, status: FriendStatus.pending },
        });
      }
    }

    return this.prisma.friend.create({
      data: { userId, friendId: targetUserId, status: FriendStatus.pending },
    });
  }

  async acceptRequest(userId: string, requesterId: string) {
    const request = await this.prisma.friend.findFirst({
      where: {
        userId: requesterId,
        friendId: userId,
        status: FriendStatus.pending,
      },
    });
    if (!request) throw new NotFoundException('No pending request found.');

    return this.prisma.friend.update({
      where: { id: request.id },
      data: { status: FriendStatus.accepted },
    });
  }

  async rejectRequest(userId: string, requesterId: string) {
    const request = await this.prisma.friend.findFirst({
      where: {
        userId: requesterId,
        friendId: userId,
        status: FriendStatus.pending,
      },
    });
    if (!request) throw new NotFoundException('No pending request found.');

    return this.prisma.friend.update({
      where: { id: request.id },
      data: { status: FriendStatus.rejected },
    });
  }

  // ─── Cancel outgoing request ──────────────────────────────────────────────
  async cancelRequest(userId: string, targetUserId: string) {
    const request = await this.prisma.friend.findFirst({
      where: {
        userId,
        friendId: targetUserId,
        status: FriendStatus.pending,
      },
    });
    if (!request) throw new NotFoundException('No pending request found.');

    await this.prisma.friend.delete({ where: { id: request.id } });

    return { message: 'Friend request cancelled.' };
  }

  async unfriend(userId: string, targetUserId: string) {
  const existing = await this.prisma.friend.findFirst({
    where: {
      OR: [
        { userId, friendId: targetUserId },
        { userId: targetUserId, friendId: userId },
      ],
      status: FriendStatus.accepted,
    },
  });
  if (!existing) {
    throw new NotFoundException('You are not friends with this user.');
  }

  // Only remove the friend record — follows are untouched
  await this.prisma.friend.delete({ where: { id: existing.id } });

  return { message: 'Unfriended successfully.' };
}

  async getFriends(userId: string) {
    const rows = await this.prisma.friend.findMany({
      where: {
        OR: [{ userId }, { friendId: userId }],
        status: FriendStatus.accepted,
      },
      include: {
        user: {
          select: {
            id: true,
            profile: { select: { username: true, handle: true, profilePhoto: true } },
          },
        },
        friend: {
          select: {
            id: true,
            profile: { select: { username: true, handle: true, profilePhoto: true } },
          },
        },
      },
    });

    return rows.map((r) => (r.userId === userId ? r.friend : r.user));
  }

  async getIncomingRequests(userId: string) {
    return this.prisma.friend.findMany({
      where: {
        friendId: userId,
        status: FriendStatus.pending,
      },
      include: {
        user: {
          select: {
            id: true,
            profile: { select: { username: true, handle: true, profilePhoto: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getOutgoingRequests(userId: string) {
    return this.prisma.friend.findMany({
      where: {
        userId,
        status: FriendStatus.pending,
      },
      include: {
        friend: {
          select: {
            id: true,
            profile: { select: { username: true, handle: true, profilePhoto: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}  // ← class closes here, everything is inside