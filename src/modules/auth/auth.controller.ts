import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  IsString,
  IsIn,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  ValidateIf,
} from 'class-validator';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from './strategies/jwt.strategy';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export class SendOtpDto {
  @ValidateIf((o) => o.via === 'email')
  @IsEmail({}, { message: 'Invalid email address' })
  @ValidateIf((o) => o.via !== 'email')
  @IsPhoneNumber(undefined, { message: 'Invalid phone number' })
  @IsString()
  identifier!: string;

  @IsOptional()
  @IsIn(['phone', 'email'])
  via?: 'phone' | 'email';

  @IsIn(['signup', 'login'])
  flow!: 'signup' | 'login';
}

export class VerifyOtpDto {
  @ValidateIf((o) => o.via === 'email')
  @IsEmail({}, { message: 'Invalid email address' })
  @ValidateIf((o) => o.via !== 'email')
  @IsPhoneNumber(undefined, { message: 'Invalid phone number' })
  @IsString()
  identifier!: string;

  @IsString()
  code!: string;

  @IsOptional()
  @IsIn(['phone', 'email'])
  via?: 'phone' | 'email';

  @IsIn(['signup', 'login'])
  flow!: 'signup' | 'login';

  /** 
   * Role selected during signup/onboarding flow.
   * Only used when `flow === 'signup'` and `isNewUser === true`.
   * Examples: "business", "driver", "delivery", "user"
   */
  @IsOptional()
  @IsString()
  @IsIn(['user', 'personal', 'business', 'driver', 'delivery', 'admin'])
  initialRole?: string;
}

export class SwitchRoleDto {
  @IsString()
  @IsIn(['user', 'personal', 'business', 'driver', 'delivery', 'admin'])
  role!: string;
}

export class SocialAuthDto {
  @IsIn(['google', 'facebook', 'apple'])
  provider!: 'google' | 'facebook' | 'apple';

  @IsString()
  token!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  /** Role selected during social signup */
  @IsOptional()
  @IsString()
  @IsIn(['user', 'personal', 'business', 'driver', 'delivery', 'admin'])
  initialRole?: string;
}

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // ── OTP ──────────────────────────────────────────────────────────────────────

  @Post('send-otp')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.auth.sendOtp(
      { via: dto.via ?? 'phone', identifier: dto.identifier },
      dto.flow,
    );
  }

  @Post('verify-otp')
  verifyOtp(
    @Body() dto: VerifyOtpDto,
    @Headers('x-session-id') sessionId?: string,
  ) {
    return this.auth.verifyOtp(
      { via: dto.via ?? 'phone', identifier: dto.identifier },
      dto.code,
      dto.flow,
      sessionId,
      dto.initialRole,           // ← Passed to support initial role on signup
    );
  }

  // ── Social Auth ─────────────────────────────────────────────────────────────

  @Post('social')
  socialAuth(@Body() dto: SocialAuthDto) {
    return this.auth.socialAuth(
      dto.provider,
      dto.token,
      dto.sessionId,
      dto.initialRole,           // ← Support initial role on social signup
    );
  }

  // ── Role management ───────────────────────────────────────────────────────────

  /**
   * POST /auth/switch-role
   * Body: { "role": "driver" }
   *
   * Returns a new JWT with the requested role set as `activeRole`.
   * Client must replace its stored token.
   */
  @Post('switch-role')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  switchRole(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SwitchRoleDto,
  ) {
    return this.auth.switchRole(user.id, dto.role);
  }

  /**
   * GET /auth/me
   * Returns current user + role info from JWT.
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthenticatedUser) {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      activeRole: user.activeRole,
      roles: user.roles,
    };
  }

  /**
   * GET /auth/roles
   * Returns up-to-date roles from database.
   */
  @Get('roles')
  @UseGuards(JwtAuthGuard)
  async getRoles(@CurrentUser() user: AuthenticatedUser) {
    return {
      activeRole: user.activeRole,
      roles: user.roles,
    };
  }
}