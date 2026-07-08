// profile/dto/profile.dto.ts

export class ProfileDto {
  id!: string;
  userId!: string;
  username!: string;
  handle!: string;

  bio!: string | null;
  profilePhoto!: string | null;

  followersCount!: number;
  followingCount!: number;
  favoriteShopsCount!: number;

  lastUsernameChange?: Date | null;
  lastHandleChange?: Date | null;
  lastAvatarChange?: Date | null;

  usernameChangeAvailableAt?: Date | null;
  handleChangeAvailableAt?: Date | null;
  avatarChangeAvailableAt?: Date | null;
}  