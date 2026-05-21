import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Block ────────────────────────────────────────────────────────────────

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself.');
    }

    const target = await this.prisma.user.findUnique({
      where: { id: blockedId },
      select: { id: true },
    });
    if (!target) throw new NotFoundException('User not found.');

    // Upsert — idempotent if already blocked
    await this.prisma.block.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });

    // ── Side-effects: clean up follow & friend relationships ──────────────
    // Run all cleanup in parallel — none of these throw if rows don't exist
    await Promise.all([
      // Remove follows in both directions
      this.prisma.follow
        .deleteMany({
          where: {
            OR: [
              { followerId: blockerId, followingId: blockedId },
              { followerId: blockedId, followingId: blockerId },
            ],
          },
        })
        .catch(() => null),

      // Remove any friend relationship in either direction
      this.prisma.friend
        .deleteMany({
          where: {
            OR: [
              { userId: blockerId, friendId: blockedId },
              { userId: blockedId, friendId: blockerId },
            ],
          },
        })
        .catch(() => null),
    ]);

    return { message: 'User blocked.' };
  }

  // ─── Unblock ──────────────────────────────────────────────────────────────

  async unblockUser(blockerId: string, blockedId: string) {
    const existing = await this.prisma.block.findUnique({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });
    if (!existing) {
      throw new NotFoundException('You have not blocked this user.');
    }

    await this.prisma.block.delete({
      where: { blockerId_blockedId: { blockerId, blockedId } },
    });

    return { message: 'User unblocked.' };
  }

  // ─── Lists ────────────────────────────────────────────────────────────────

  /// All users the caller has blocked
  async getBlockedUsers(blockerId: string) {
    const rows = await this.prisma.block.findMany({
      where: { blockerId },
      include: {
        blocked: {
          select: {
            id: true,
            profile: {
              select: { username: true, handle: true, profilePhoto: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map((r) => r.blocked);
  }

  /// Convenience check used by guards / other services
  async isBlocked(userAId: string, userBId: string): Promise<boolean> {
    const block = await this.prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: userAId, blockedId: userBId },
          { blockerId: userBId, blockedId: userAId },
        ],
      },
      select: { id: true },
    });
    return !!block;
  }
}