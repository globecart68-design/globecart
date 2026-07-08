import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { SocialAuthDto } from './dto/social_auth.dto';

@Controller('auth/social')
export class SocialAuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * POST /auth/social
   *
   * Accepts a provider token from the client and returns an access token + profile.
   * Supports initial role selection during signup (e.g., business, driver, etc.).
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async socialAuth(@Body() dto: SocialAuthDto) {
    return this.auth.socialAuth(
      dto.provider,
      dto.token,
      dto.sessionId,
      dto.initialRole,           // ← NEW: Support starting in selected role
    );
  }
}