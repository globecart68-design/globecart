import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService } from '../auth.service';
import { SocialAuthDto } from './dto/social_auth.dto';

@Controller('auth/social')
export class SocialAuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * POST /auth/social
   *
   * Accepts a provider token from the client (Google ID token, Facebook access
   * token, or Apple ID token) and returns an access token + profile, creating
   * an account automatically if one does not yet exist.
   *
   * The client should obtain the token via the provider's own SDK before
   * calling this endpoint — the server never redirects to provider OAuth pages.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async socialAuth(@Body() dto: SocialAuthDto) {
    return this.auth.socialAuth(dto.provider, dto.token, dto.sessionId);
  }
}