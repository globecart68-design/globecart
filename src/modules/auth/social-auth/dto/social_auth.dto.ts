import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type SocialProvider = 'google' | 'facebook' | 'apple';

export class SocialAuthDto {
  @IsEnum(['google', 'facebook', 'apple'])
  provider!: SocialProvider;

  /**
   * The ID token (Google, Apple) or access token (Facebook) returned by
   * the provider's SDK on the client side.
   */
  @IsString()
  @IsNotEmpty()
  token!: string;

  /**
   * Optional — passed through to attachSession if present.
   */
  @IsString()
  @IsOptional()
  sessionId?: string;
}