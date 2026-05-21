import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import * as jwt from 'jsonwebtoken';
import { JwksClient } from 'jwks-rsa';

export type SocialProvider = 'google' | 'facebook' | 'apple';

export interface SocialProfile {
  provider: SocialProvider;
  /** Stable provider-scoped user ID — stored as `providerId` on AuthProvider. */
  providerUserId: string;
  email: string | null;
  /**
   * Display name returned by the provider.
   * Not stored on AuthProvider (which has no such column) but available
   * for downstream use, e.g. pre-populating a new user's profile.
   */
  displayName: string | null;
  /**
   * Avatar URL returned by the provider.
   * Not stored on AuthProvider — available for profile pre-population only.
   */
  avatarUrl: string | null;
}

@Injectable()
export class SocialTokenVerifierService {
  private readonly logger = new Logger(SocialTokenVerifierService.name);

  private readonly googleClient: OAuth2Client;
  private readonly googleClientIds: string[];
  private readonly facebookAppId: string;
  private readonly facebookAppSecret: string;
  private readonly appleClientId: string;

  // Apple's public JWKS endpoint — keys rotate infrequently; cache aggressively.
  private readonly appleJwksClient: JwksClient;

  constructor(private readonly config: ConfigService) {
    const googleClientId = this.config.getOrThrow<string>('GOOGLE_CLIENT_ID');
    const androidGoogleClientId = this.config.get<string>('ANDROID_GOOGLE_CLIENT_ID');
    this.googleClientIds = [googleClientId, androidGoogleClientId].filter(Boolean) as string[];
    this.googleClient = new OAuth2Client(googleClientId);

    this.facebookAppId = this.config.getOrThrow<string>('FACEBOOK_APP_ID');
    this.facebookAppSecret = this.config.getOrThrow<string>('FACEBOOK_APP_SECRET');

    this.appleClientId = this.config.getOrThrow<string>('APPLE_CLIENT_ID');
    this.appleJwksClient = new JwksClient({
      jwksUri: 'https://appleid.apple.com/auth/keys',
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 10 * 60 * 60 * 1000, // 10 hours
    });
  }

  async verify(provider: SocialProvider, token: string): Promise<SocialProfile> {
    switch (provider) {
      case 'google':
        return this.verifyGoogle(token);
      case 'facebook':
        return this.verifyFacebook(token);
      case 'apple':
        return this.verifyApple(token);
    }
  }

  // ------------------------------------------------------------------ Google

  private async verifyGoogle(idToken: string): Promise<SocialProfile> {
    try {
      const ticket = await this.googleClient.verifyIdToken({
        idToken,
        audience: this.googleClientIds,
      });
      const payload = ticket.getPayload();

      if (!payload?.sub) {
        throw new UnauthorizedException('Google token payload is missing subject');
      }

      return {
        provider: 'google',
        providerUserId: payload.sub,
        email: payload.email ?? null,
        displayName: payload.name ?? null,
        avatarUrl: payload.picture ?? null,
      };
    } catch (err) {
      this.logger.warn(`Google token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Google token');
    }
  }

  // ---------------------------------------------------------------- Facebook

  /**
   * Facebook issues access tokens, not ID tokens. We validate by calling the
   * Graph API's /debug_token endpoint, which avoids accepting tokens issued
   * for a different app (the "confused deputy" problem).
   */
  private async verifyFacebook(accessToken: string): Promise<SocialProfile> {
    const appToken = `${this.facebookAppId}|${this.facebookAppSecret}`;
    const debugUrl =
      `https://graph.facebook.com/debug_token` +
      `?input_token=${encodeURIComponent(accessToken)}` +
      `&access_token=${encodeURIComponent(appToken)}`;

    let debugData: FacebookDebugResponse;
    try {
      const res = await fetch(debugUrl);
      debugData = (await res.json()) as FacebookDebugResponse;
    } catch (err) {
      this.logger.warn(`Facebook debug_token request failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Could not verify Facebook token');
    }

    const info = debugData.data;

    if (!info?.is_valid) {
      throw new UnauthorizedException('Invalid Facebook token');
    }

    if (info.app_id !== this.facebookAppId) {
      // Token was issued for a different app — reject it.
      throw new UnauthorizedException('Facebook token was issued for a different application');
    }

    // Fetch the user's profile fields using the (now verified) access token.
    const profileUrl =
      `https://graph.facebook.com/me` +
      `?fields=id,name,email,picture` +
      `&access_token=${encodeURIComponent(accessToken)}`;

    let profileData: FacebookProfileResponse;
    try {
      const res = await fetch(profileUrl);
      profileData = (await res.json()) as FacebookProfileResponse;
    } catch (err) {
      this.logger.warn(`Facebook profile fetch failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Could not fetch Facebook profile');
    }

    if (!profileData?.id) {
      throw new UnauthorizedException('Facebook profile missing user ID');
    }

    return {
      provider: 'facebook',
      providerUserId: profileData.id,
      email: profileData.email ?? null,
      displayName: profileData.name ?? null,
      avatarUrl: profileData.picture?.data?.url ?? null,
    };
  }

  // ------------------------------------------------------------------- Apple

  /**
   * Apple issues signed JWTs. We verify the signature against Apple's public
   * JWKS, then check audience and issuer. Apple only sends the user's email on
   * the *first* authorisation — on subsequent logins the email field is absent.
   */
  private async verifyApple(idToken: string): Promise<SocialProfile> {
    // Decode header without verification to get the key ID.
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || typeof decoded === 'string' || !decoded.header?.kid) {
      throw new UnauthorizedException('Apple token is malformed');
    }

    let publicKey: string;
    try {
      const key = await this.appleJwksClient.getSigningKey(decoded.header.kid);
      publicKey = key.getPublicKey();
    } catch (err) {
      this.logger.warn(`Apple JWKS key retrieval failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Could not retrieve Apple public key');
    }

    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(idToken, publicKey, {
        algorithms: ['RS256'],
        audience: this.appleClientId,
        issuer: 'https://appleid.apple.com',
      }) as jwt.JwtPayload;
    } catch (err) {
      this.logger.warn(`Apple token verification failed: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid Apple token');
    }

    if (!payload.sub) {
      throw new UnauthorizedException('Apple token payload is missing subject');
    }

    return {
      provider: 'apple',
      providerUserId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : null,
      displayName: null, // Apple does not provide display name in the token
      avatarUrl: null,   // Apple does not provide an avatar
    };
  }
}

// ----------------------------------------------------------- Facebook types

interface FacebookDebugResponse {
  data: {
    app_id: string;
    is_valid: boolean;
    user_id?: string;
  };
}

interface FacebookProfileResponse {
  id: string;
  name?: string;
  email?: string;
  picture?: {
    data?: {
      url?: string;
    };
  };
}