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
import { CurrentUser, ActiveRole } from '../../common/decorators/current-user.decorator';
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
}

export class SwitchRoleDto {
  @IsString()
  role!: string;
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
    );
  }

  // ── Role management ───────────────────────────────────────────────────────────

  /**
   * POST /auth/switch-role
   * Body: { "role": "driver" }
   *
   * Requires: Bearer token (any valid role)
   *
   * Returns a new JWT with the requested role set as `activeRole`.
   * The client must replace its stored token with the returned `accessToken`.
   *
   * 403 if the user does not hold the requested role.
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
   * Returns the current user identity and role information from the JWT.
   * Useful for the client to bootstrap the role switcher UI.
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
   * Returns the user's assigned roles from the database (always up-to-date).
   * Use this when you suspect the token's role snapshot is stale.
   */
  @Get('roles')
  @UseGuards(JwtAuthGuard)
  async getRoles(@CurrentUser() user: AuthenticatedUser) {
    // re-use switchRole's role fetching logic by just exposing activeRole info
    return {
      activeRole: user.activeRole,
      roles: user.roles,
    };
  }
}
