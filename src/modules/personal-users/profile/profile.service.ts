import { Injectable, NotFoundException, ConflictException, Logger, } from '@nestjs/common'; 
import { PrismaService } from '../../../prisma/prisma.service'; 
import { StorageService } from '../../storage/storage.service'; 
import { ProfileDto } from './dto/profile.dto'; 
import { UpdateProfileDto } from './dto/update-profile.dto'; 
import { UserProfile } from '@prisma/client';
import { AvailabilityDto } from './dto/availability.dto';

const USERNAME_LIMIT_DAYS = 5;
const HANDLE_LIMIT_DAYS = 15;
const AVATAR_LIMIT_MINS = 5;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findByUserId(userId: string): Promise<ProfileDto> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const stats = await this.getStats(userId);

    return this.toDto(profile, stats);
  }
  
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<ProfileDto> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile) throw new NotFoundException('Profile not found');

    const now = new Date();

    /**
     * USERNAME RATE LIMIT
     */
    if (dto.username && dto.username !== profile.username) {
      this.checkRateLimit(
        profile.lastUsernameChange,
        USERNAME_LIMIT_DAYS,
        'Username'
      );

      const taken = await this.prisma.userProfile.findFirst({
        where: {
          username: dto.username,
          NOT: { userId: userId },
        },
      });

      if (taken)
        throw new ConflictException('Username already taken');
    }

    /**
     * HANDLE RATE LIMIT
     */
    if (dto.handle && dto.handle !== profile.handle) {
      this.checkRateLimit(
        profile.lastHandleChange,
        HANDLE_LIMIT_DAYS,
        'Handle'
      );
    }

    const updated = await this.prisma.userProfile.update({
      where: { userId },
      data: {
        ...(dto.username &&
          dto.username !== profile.username && {
            username: dto.username,
            lastUsernameChange: now,
          }),

        ...(dto.handle &&
          dto.handle !== profile.handle && {
            handle: dto.handle,
            lastHandleChange: now,
          }),

        ...(dto.bio !== undefined && {
          bio: dto.bio,
        }),
      },
    });

    const stats = await this.getStats(userId);

    return this.toDto(updated, stats);
  }

  async checkHandleAvailability(
  handle: string,
  userId?: string,
): Promise<AvailabilityDto> {

  if (!handle.startsWith('@')) {
    handle = `@${handle}`;
  }

  const existing = await this.prisma.userProfile.findFirst({
    where: {
      handle,
      ...(userId && {
        NOT: { userId },
      }),
    },
  });

  if (existing) {
    return {
      available: false,
      message: 'Handle already taken',
    };
  }

  return {
    available: true,
    message: 'Handle available',
  };
}

  async updateAvatar(
    userId: string,
    file: Express.Multer.File
  ): Promise<ProfileDto> {

    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile)
      throw new NotFoundException('Profile not found');

    /**
     * AVATAR RATE LIMIT
     */
    this.checkRateLimitMinutes(
      profile.lastAvatarChange,
      AVATAR_LIMIT_MINS,
      'Avatar'
    );

    if (profile.profilePhoto) {
      await this.storage.deleteAvatar(profile.profilePhoto)
        .catch(err =>
          this.logger.warn(
            `Failed to delete old avatar: ${err.message}`
          )
        );
    }

    const profilePhoto =
      await this.storage.uploadAvatar(file);

    const updated =
      await this.prisma.userProfile.update({
        where: { userId },
        data: {
          profilePhoto,
          lastAvatarChange: new Date(),
        },
      });

    const stats = await this.getStats(userId);

    return this.toDto(updated, stats);
  }

  async removeAvatar(userId: string): Promise<ProfileDto> {
    const profile = await this.prisma.userProfile.findUnique({
      where: { userId },
    });

    if (!profile)
      throw new NotFoundException('Profile not found');

    if (!profile.profilePhoto)
      throw new NotFoundException('No profile photo to remove');

    await this.storage.deleteAvatar(profile.profilePhoto)
      .catch(err =>
        this.logger.warn(
          `Failed to delete avatar from storage: ${err.message}`
        )
      );

    const updated = await this.prisma.userProfile.update({
      where: { userId },
      data: { profilePhoto: null },
    });

    const stats = await this.getStats(userId);

    return this.toDto(updated, stats);
  }

  async createForUser(userId: string): Promise<ProfileDto> {

    const username =
      await this.generateUsername();

    const handle =
      await this.generateHandle(username);

    const profile =
      await this.prisma.userProfile.create({
        data: {
          userId,
          username,
          handle,
        },
      });

    return this.toDto(profile, {
      followersCount: 0,
      followingCount: 0,
      favoriteShopsCount: 0,
    });
  }

  /**
   * RATE LIMIT HELPERS
   */

  private checkRateLimit(
    lastChange: Date | null,
    limitDays: number,
    label: string
  ) {

    if (!lastChange) return;

    const now = new Date();

    const diffDays =
      (now.getTime() - lastChange.getTime()) /
      (1000 * 60 * 60 * 24);

    if (diffDays < limitDays) {
      const remaining =
        Math.ceil(limitDays - diffDays);

      throw new ConflictException(
        `${label} can only be changed once every ${limitDays} days. Try again in ${remaining} day(s).`
      );
    }
  }

  private checkRateLimitMinutes(
    lastChange: Date | null,
    limitMinutes: number,
    label: string
  ) {

    if (!lastChange) return;

    const now = new Date();

    const diffMinutes =
      (now.getTime() - lastChange.getTime()) /
      (1000 * 60);

    if (diffMinutes < limitMinutes) {
      const remaining =
        Math.ceil(limitMinutes - diffMinutes);

      throw new ConflictException(
        `${label} can only be changed once every ${limitMinutes} minutes. Try again in ${remaining} minute(s).`
      );
    }
  }

  /**
   * STATS HELPER
   */

  private async getStats(userId: string) {

    const [
      followersCount,
      followingCount,
      favoriteShopsCount
    ] = await Promise.all([
      this.prisma.follow.count({
        where: { followingId: userId }
      }),

      this.prisma.follow.count({
        where: { followerId: userId }
      }),

      this.prisma.favoriteShop.count({
        where: { userId }
      }),
    ]);

    return {
      followersCount,
      followingCount,
      favoriteShopsCount
    };
  }

  /**
   * USERNAME GENERATOR
   */

  private async generateUsername(): Promise<string> {

    while (true) {

      const candidate =
        `user_${Math.random()
          .toString(36)
          .slice(2, 8)}`;

      const exists =
        await this.prisma.userProfile.findFirst({
          where: { username: candidate },
        });

      if (!exists) return candidate;
    }
  }

  /**
   * HANDLE GENERATOR
   */

  private async generateHandle(
    username: string
  ): Promise<string> {

    const candidate = `@${username}`;

    const exists =
      await this.prisma.userProfile.findFirst({
        where: { handle: candidate },
      });

    if (!exists) return candidate;

    while (true) {

      const suffix =
        Math.random()
          .toString(36)
          .slice(2, 6);

      const withSuffix =
        `@${username}_${suffix}`;

      const suffixExists =
        await this.prisma.userProfile.findFirst({
          where: { handle: withSuffix },
        });

      if (!suffixExists)
        return withSuffix;
    }
  }

  private toDto(
    profile: UserProfile,
    stats: {
      followersCount: number;
      followingCount: number;
      favoriteShopsCount: number;
    }
  ): ProfileDto {

    return {
      id: profile.id,
      userId: profile.userId,
      username: profile.username,
      handle: profile.handle,
      bio: profile.bio,
      profilePhoto: profile.profilePhoto,
      followersCount: stats.followersCount,
      followingCount: stats.followingCount,
      favoriteShopsCount: stats.favoriteShopsCount,
      lastUsernameChange: profile.lastUsernameChange,
      lastHandleChange: profile.lastHandleChange,
      lastAvatarChange: profile.lastAvatarChange,
    };
  }
}