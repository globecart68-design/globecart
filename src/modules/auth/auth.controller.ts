import {
  Body,
  Controller,
  Delete,
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
  MinLength,
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

// ─── Password DTOs ──────────────────────────────────────────────────────────

/** Shared identifier + via validation, mirrors SendOtpDto. */
class IdentifierDto {
  @ValidateIf((o) => o.via === 'email')
  @IsEmail({}, { message: 'Invalid email address' })
  @ValidateIf((o) => o.via !== 'email')
  @IsPhoneNumber(undefined, { message: 'Invalid phone number' })
  @IsString()
  identifier!: string;

  @IsOptional()
  @IsIn(['phone', 'email'])
  via?: 'phone' | 'email';
}

export class RegisterPasswordDto extends IdentifierDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['user', 'personal', 'business', 'driver', 'delivery', 'admin'])
  initialRole?: string;
}

export class LoginPasswordDto extends IdentifierDto {
  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  @IsIn(['user', 'personal', 'business', 'driver', 'delivery', 'admin'])
  initialRole?: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword!: string;

  /** Required only if the account already has a password set. */
  @IsOptional()
  @IsString()
  currentPassword?: string;
}

export class LogoutDto {
  /** The push-notification token for *this* device, if any — lets the
   *  server unregister it so notifications stop after logout. */
  @IsOptional()
  @IsString()
  deviceToken?: string;
}

export class DeleteAccountDto {
  /** Required only if the account already has a password set. */
  @IsOptional()
  @IsString()
  password?: string;
}

export class ForgotPasswordDto extends IdentifierDto {}

export class ResetPasswordDto extends IdentifierDto {
  @IsString()
  code!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword!: string;
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

  // ── Password Auth ────────────────────────────────────────────────────────────

  /**
   * POST /auth/register-password
   * Creates a brand-new account secured with a password instead of an OTP
   * round-trip.
   */
  @Post('register-password')
  registerWithPassword(@Body() dto: RegisterPasswordDto) {
    return this.auth.registerWithPassword(
      { via: dto.via ?? 'email', identifier: dto.identifier },
      dto.password,
      dto.sessionId,
      dto.initialRole,
    );
  }

  /**
   * POST /auth/login-password
   * Logs in with an email/phone + password.
   */
  @Post('login-password')
  @HttpCode(HttpStatus.OK)
  loginWithPassword(@Body() dto: LoginPasswordDto) {
    return this.auth.loginWithPassword(
      { via: dto.via ?? 'email', identifier: dto.identifier },
      dto.password,
      dto.sessionId,
      dto.initialRole,
    );
  }

  /**
   * POST /auth/change-password
   * Changes (or, for OTP/social-only accounts, sets for the first time)
   * the password for the currently authenticated user.
   */
  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      user.id,
      dto.newPassword,
      dto.currentPassword,
    );
  }

  /**
   * POST /auth/logout
   * Stateless JWT, so there's nothing to revoke server-side — the client
   * drops its stored token. If a device push-token is supplied it gets
   * unregistered so this device stops receiving notifications.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  logout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LogoutDto,
  ) {
    return this.auth.logout(user.id, dto.deviceToken);
  }

  /**
   * DELETE /auth/account
   * Permanently deletes the authenticated user's account and everything
   * owned by it. Requires the account password when one is set.
   */
  @Delete('account')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  deleteAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.auth.deleteAccount(user.id, dto.password);
  }

  /**
   * POST /auth/forgot-password
   * Always returns a generic message regardless of whether the identifier
   * is registered, to avoid account enumeration.
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword({
      via: dto.via ?? 'email',
      identifier: dto.identifier,
    });
  }

  /**
   * POST /auth/reset-password
   * Consumes a forgot-password code and sets a new password.
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(
      { via: dto.via ?? 'email', identifier: dto.identifier },
      dto.code,
      dto.newPassword,
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