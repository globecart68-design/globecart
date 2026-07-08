import { IsEnum, IsNotEmpty, IsOptional, IsString, IsIn } from 'class-validator';

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

  /**
   * Initial role selected by the user during signup/onboarding.
   * Only used when creating a new account.
   * Supported values: user, business, driver, delivery
   */
  @IsOptional()
  @IsString()
  @IsIn(['user', 'personal', 'business', 'driver', 'delivery', 'admin'])
  initialRole?: string;
}