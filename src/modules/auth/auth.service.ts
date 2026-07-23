import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionsService } from '../sessions/sessions.service';
import { SmsService } from './utils/sms/sms.service';
import { EmailService } from './utils/email/email.service';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { otpEmailTemplate } from './utils/email/templates/otp.template';
import { otpSmsTemplate } from './utils/sms/templates/otp.template';
import { resetPasswordEmailTemplate } from './utils/email/templates/reset-password.template';
import { resetPasswordSmsTemplate } from './utils/sms/templates/reset-password.template';
import { ProfileService } from '../personal-users/profile/profile.service';
import { ProfileDto } from '../personal-users/profile/dto/profile.dto';
import {
  SocialTokenVerifierService,
  SocialProvider,
} from './social-auth/social_token_verifier.service';
import { RolesService } from '../roles/roles.service';
import { BusinessOnboardingService } from '../onboarding/business/business-onboarding.service';

type PrismaTx = Prisma.TransactionClient;

type OtpChannel =
  | { via: 'phone'; identifier: string }
  | { via: 'email'; identifier: string };

type AuthFlow = 'signup' | 'login';

/** What a given OTPCode row is for — keeps a forgot-password code from
 *  colliding with (or being satisfiable by) an in-flight signup/login OTP
 *  for the same identifier. */
type OtpPurpose = 'auth' | 'password_reset';

/** Default base role for every new account */
const DEFAULT_ROLE = 'user';

// Every account gets all four base roles at signup. Holding a role no
// longer implies the user is *approved* to act on it — Business, Delivery,
// and Driver each gate real capability behind their own onboarding status
// (a registered shop, or an admin-approved profile). The role list on the
// JWT only controls which shells `/auth/switch-role` will let you enter;
// the shell itself checks onboarding status and shows a setup/pending
// screen when needed instead of the switch call failing outright.
const BASE_ROLES = ['user', 'business', 'delivery', 'driver'];

export type AuthResult = {
  accessToken: string;
  profile: ProfileDto;
  isNewUser: boolean;
  /** Active role encoded in this token */
  activeRole: string;
  /** All roles the user holds */
  roles: string[];
};

export type SwitchRoleResult = {
  accessToken: string;
  activeRole: string;
  roles: string[];
};

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  private readonly OTP_EXPIRY_MS: number;
  private readonly OTP_RATE_LIMIT_MS: number;
  private readonly OTP_MAX_ATTEMPTS: number;

  private readonly PASSWORD_RESET_EXPIRY_MS: number;
  private readonly PASSWORD_RESET_RATE_LIMIT_MS: number;

  private static readonly OTP_CODE_RE = /^\d{6}$/;
  private static readonly SALT_ROUNDS = 12;
  private static readonly MIN_PASSWORD_LENGTH = 8;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly profiles: ProfileService,
    private readonly socialVerifier: SocialTokenVerifierService,
    private readonly rolesService: RolesService, // ← Added
    private readonly businessOnboarding: BusinessOnboardingService,
  ) {
    this.OTP_EXPIRY_MS = parseInt(
      this.config.get<string>('OTP_EXPIRY_MS', String(5 * 60 * 1000)),
      10,
    );
    this.OTP_RATE_LIMIT_MS = parseInt(
      this.config.get<string>('OTP_RATE_LIMIT_MS', String(60 * 1000)),
      10,
    );
    this.OTP_MAX_ATTEMPTS = parseInt(
      this.config.get<string>('OTP_MAX_ATTEMPTS', '5'),
      10,
    );
    this.PASSWORD_RESET_EXPIRY_MS = parseInt(
      this.config.get<string>(
        'PASSWORD_RESET_EXPIRY_MS',
        String(30 * 60 * 1000),
      ),
      10,
    );
    this.PASSWORD_RESET_RATE_LIMIT_MS = parseInt(
      this.config.get<string>('PASSWORD_RESET_RATE_LIMIT_MS', String(60 * 1000)),
      10,
    );
  }

  // ─── Send OTP ────────────────────────────────────────────────────────────────

  async sendOtp(
    channel: OtpChannel,
    flow: AuthFlow,
  ): Promise<{ message: string }> {
    await this.enforceRateLimit(channel, 'auth');

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS);
    const baseData = {
      code: hashedCode,
      attempts: 0,
      expiresAt,
      purpose: 'auth' as const,
    };
    const channelData = this.identifierField(channel);

    await this.prisma.$transaction(async (tx) => {
      await this.enforceFlowGuard(channel, flow, tx);
      await tx.oTPCode.deleteMany({ where: { ...channelData, purpose: 'auth' } });
      await tx.oTPCode.create({ data: { ...baseData, ...channelData } });
    });

    await this.dispatchOtp(channel, code);
    this.logger.log(
      `OTP dispatched via ${channel.via} to ${channel.identifier} (flow: ${flow})`,
    );

    return { message: 'OTP sent' };
  }

  // ─── Verify OTP ──────────────────────────────────────────────────────────────

  async verifyOtp(
    channel: OtpChannel,
    code: string,
    flow: AuthFlow,
    sessionId?: string,
    initialRole?: string,        // ← NEW: Role selected during signup/onboarding
  ): Promise<AuthResult> {
    if (!AuthService.OTP_CODE_RE.test(code)) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const identifierField = this.identifierField(channel);

    const otp = await this.prisma.oTPCode.findFirst({
      where: {
        ...identifierField,
        purpose: 'auth',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new UnauthorizedException('Invalid or expired OTP');

    if (!(await bcrypt.compare(code, otp.code))) {
      const updated = await this.prisma.oTPCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });

      if (updated.attempts >= this.OTP_MAX_ATTEMPTS) {
        await this.prisma.oTPCode.delete({ where: { id: otp.id } });
        throw new UnauthorizedException(
          'Too many failed attempts. Please request a new OTP.',
        );
      }

      const remaining = this.OTP_MAX_ATTEMPTS - updated.attempts;
      throw new UnauthorizedException(
        `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      );
    }

    const { user, isNewUser } = await this.prisma.$transaction(async (tx) => {
      await tx.oTPCode.delete({ where: { id: otp.id } });
      await tx.oTPCode.deleteMany({
        where: { ...identifierField, expiresAt: { lt: new Date() } },
      });
      return this.resolveUser(tx, channel, flow);
    });

    return this.finaliseAuth(user, isNewUser, sessionId, initialRole);
  }

  // ─── Social Auth ─────────────────────────────────────────────────────────────

  async socialAuth(
    provider: SocialProvider,
    token: string,
    sessionId?: string,
    initialRole?: string,        // ← NEW
  ): Promise<AuthResult> {
    const socialProfile = await this.socialVerifier.verify(provider, token);

    const { user, isNewUser } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.authProvider.findUnique({
        where: {
          provider_providerUserId: {
            provider,
            providerUserId: socialProfile.providerUserId,
          },
        },
        include: { user: true },
      });

      if (existing) return { user: existing.user, isNewUser: false };

      let user: User | null = null;
      if (socialProfile.email) {
        user = await tx.user.findUnique({ where: { email: socialProfile.email } });
      }

      if (user) {
        await tx.authProvider.create({
          data: {
            provider,
            providerUserId: socialProfile.providerUserId,
            displayName: socialProfile.displayName,
            avatarUrl: socialProfile.avatarUrl,
            userId: user.id,
          },
        });
        return { user, isNewUser: false };
      }

      const newUser = await tx.user.create({
        data: socialProfile.email ? { email: socialProfile.email } : {},
      });

      await tx.authProvider.create({
        data: {
          provider,
          providerUserId: socialProfile.providerUserId,
          displayName: socialProfile.displayName,
          avatarUrl: socialProfile.avatarUrl,
          userId: newUser.id,
        },
      });

      return { user: newUser, isNewUser: true };
    });

    return this.finaliseAuth(user, isNewUser, sessionId, initialRole);
  }

  // ─── Switch Role ──────────────────────────────────────────────────────────────

  async switchRole(userId: string, requestedRole: string): Promise<SwitchRoleResult> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
      include: { role: true },
    });

    const roleNames = userRoles.map((ur) => ur.role.name);

    if (!roleNames.includes(requestedRole)) {
      throw new ForbiddenException(
        `You do not hold the role "${requestedRole}". ` +
          `Your assigned roles are: ${roleNames.join(', ') || 'none'}.`,
      );
    }

    // Persist last used role
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveRole: requestedRole },
    });

    const { accessToken } = this.signToken(userId, requestedRole, roleNames);

    this.logger.log(`User ${userId} switched active role to "${requestedRole}"`);

    return { accessToken, activeRole: requestedRole, roles: roleNames };
  }

  // ─── Password Auth ────────────────────────────────────────────────────────────
  //
  // A password is an optional credential a user can add to their account —
  // accounts created via OTP or social sign-in have `passwordHash: null`
  // until they either register directly with a password or set one later
  // via `changePassword`. This mirrors how `AuthProvider` rows are optional
  // additions on top of the same underlying User.

  /** Create a brand-new account with an email/phone + password (no OTP
   *  round-trip). Ownership of the identifier isn't verified at this step —
   *  same trade-off most email+password apps make; add an email/phone
   *  verification step later if that matters for this product. */
  async registerWithPassword(
    channel: OtpChannel,
    password: string,
    sessionId?: string,
    initialRole?: string,
  ): Promise<AuthResult> {
    const field = this.identifierField(channel);

    const { user, isNewUser } = await this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: field });
      if (existing) {
        throw new BadRequestException(
          'An account with this identifier already exists. Please log in.',
        );
      }

      const passwordHash = await bcrypt.hash(password, AuthService.SALT_ROUNDS);
      const user = await tx.user.create({ data: { ...field, passwordHash } });
      return { user, isNewUser: true };
    });

    return this.finaliseAuth(user, isNewUser, sessionId, initialRole);
  }

  /** Log in with an email/phone + password. Deliberately returns the same
   *  "Invalid credentials" message whether the account doesn't exist, has
   *  no password set, or the password is wrong — avoids confirming which
   *  identifiers are registered. */
  async loginWithPassword(
    channel: OtpChannel,
    password: string,
    sessionId?: string,
    initialRole?: string,
  ): Promise<AuthResult> {
    const field = this.identifierField(channel);
    const user = await this.prisma.user.findUnique({ where: field });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.finaliseAuth(user, false, sessionId, initialRole);
  }

  /** Change (or, for OTP/social-only accounts, set for the first time) the
   *  password for an already-authenticated user. `currentPassword` is
   *  required only if the account already has a password. */
  async changePassword(
    userId: string,
    newPassword: string,
    currentPassword?: string,
  ): Promise<{ message: string }> {
    this.assertPasswordPolicy(newPassword);

    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
    });

    if (user.passwordHash) {
      if (!currentPassword) {
        throw new BadRequestException('Current password is required');
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        throw new UnauthorizedException('Current password is incorrect');
      }
    }

    const passwordHash = await bcrypt.hash(newPassword, AuthService.SALT_ROUNDS);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });

    this.logger.log(`Password ${user.passwordHash ? 'changed' : 'set'} for user ${userId}`);

    return { message: 'Password updated' };
  }

  // ─── Forgot / Reset Password ──────────────────────────────────────────────────

  /** Always returns the same generic message regardless of whether the
   *  identifier is registered — the classic account-enumeration vector for
   *  this endpoint, so unlike login we don't reveal anything here. */
  async forgotPassword(channel: OtpChannel): Promise<{ message: string }> {
    const GENERIC = {
      message: 'If an account exists for this identifier, a reset code has been sent.',
    };

    const field = this.identifierField(channel);
    const user = await this.prisma.user.findUnique({ where: field });
    if (!user) return GENERIC;

    await this.enforceRateLimit(channel, 'password_reset');

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.PASSWORD_RESET_EXPIRY_MS);
    const channelData = this.identifierField(channel);

    await this.prisma.$transaction(async (tx) => {
      await tx.oTPCode.deleteMany({
        where: { ...channelData, purpose: 'password_reset' },
      });
      await tx.oTPCode.create({
        data: {
          code: hashedCode,
          attempts: 0,
          expiresAt,
          purpose: 'password_reset',
          ...channelData,
        },
      });
    });

    await this.dispatchPasswordResetCode(channel, code);
    this.logger.log(
      `Password reset code dispatched via ${channel.via} to ${channel.identifier}`,
    );

    return GENERIC;
  }

  /** Consumes a forgot-password code and sets a new password. Same
   *  hash/attempts/expiry handling as `verifyOtp`, scoped to the
   *  `password_reset` purpose so it can't be satisfied by (or collide
   *  with) an in-flight signup/login OTP. */
  async resetPassword(
    channel: OtpChannel,
    code: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    this.assertPasswordPolicy(newPassword);

    if (!AuthService.OTP_CODE_RE.test(code)) {
      throw new UnauthorizedException('Invalid or expired reset code');
    }

    const identifierField = this.identifierField(channel);

    const otp = await this.prisma.oTPCode.findFirst({
      where: {
        ...identifierField,
        purpose: 'password_reset',
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new UnauthorizedException('Invalid or expired reset code');

    if (!(await bcrypt.compare(code, otp.code))) {
      const updated = await this.prisma.oTPCode.update({
        where: { id: otp.id },
        data: { attempts: { increment: 1 } },
      });

      if (updated.attempts >= this.OTP_MAX_ATTEMPTS) {
        await this.prisma.oTPCode.delete({ where: { id: otp.id } });
        throw new UnauthorizedException(
          'Too many failed attempts. Please request a new reset code.',
        );
      }

      const remaining = this.OTP_MAX_ATTEMPTS - updated.attempts;
      throw new UnauthorizedException(
        `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      );
    }

    const user = await this.prisma.user.findUnique({ where: identifierField });
    if (!user) throw new UnauthorizedException('Invalid or expired reset code');

    const passwordHash = await bcrypt.hash(newPassword, AuthService.SALT_ROUNDS);

    await this.prisma.$transaction(async (tx) => {
      await tx.oTPCode.delete({ where: { id: otp.id } });
      await tx.oTPCode.deleteMany({
        where: { ...identifierField, purpose: 'password_reset' },
      });
      await tx.user.update({ where: { id: user.id }, data: { passwordHash } });
    });

    this.logger.log(`Password reset for user ${user.id}`);

    return { message: 'Password has been reset. You can now log in.' };
  }

  private assertPasswordPolicy(password: string): void {
    if (password.length < AuthService.MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(
        `Password must be at least ${AuthService.MIN_PASSWORD_LENGTH} characters long`,
      );
    }
  }

  private async dispatchPasswordResetCode(
    channel: OtpChannel,
    code: string,
  ): Promise<void> {
    if (channel.via === 'phone') {
      await this.sms.sendSms(channel.identifier, resetPasswordSmsTemplate(code));
    } else {
      await this.email.sendEmail(
        channel.identifier,
        'Reset your Globecart password',
        'Please enable HTML to view this email.',
        resetPasswordEmailTemplate(code),
      );
    }
  }

  // ─── Shared post-auth finalisation ───────────────────────────────────────────

  private async finaliseAuth(
    user: User,
    isNewUser: boolean,
    sessionId?: string,
    initialRole?: string,
  ): Promise<AuthResult> {
    await this.ensureDefaultRole(user.id, isNewUser);

    // Grant the role the user chose during onboarding / role-selection.
    // grantRole() is idempotent (upsert), so calling it for returning users
    // who already hold the role is safe.  We must NOT guard this with
    // `isNewUser` — a returning user who cleared app data and re-ran
    // onboarding with a different role must have that role granted so the
    // activation check below (`roleNames.includes(initialRole)`) passes.
    if (initialRole && initialRole !== DEFAULT_ROLE) {
      await this.rolesService.grantRole(user.id, initialRole);
    }

    if (isNewUser) {
      try {
        await this.profiles.createForUser(user.id);
      } catch (err) {
        this.logger.error(
          `Failed to create profile for new user ${user.id}`,
          err instanceof Error ? err.stack : String(err),
        );
        throw new InternalServerErrorException(
          'Account created but profile setup failed. Please contact support.',
        );
      }
    }

    if (sessionId) {
      await this.attachSession(user.id, sessionId);
    }

    // Load current roles
    let roleNames = await this.rolesService.getUserRoles(user.id);

    // Ensure at least default role
    if (roleNames.length === 0) {
      await this.ensureDefaultRole(user.id, true);
      roleNames = await this.rolesService.getUserRoles(user.id);
    }

    // Determine active role.
    //
    // Priority:
    //   1. initialRole — the role the user explicitly selected on this device
    //      (onboarding or role-selection screen). Always honoured when the
    //      client sends it and the user actually holds that role.
    //   2. lastActiveRole (DB) — last role persisted for returning users.
    //      Only used when initialRole is absent (e.g. a plain login with no
    //      role selection step). Guarded by roleNames to avoid a stale DB
    //      value from a previous session overriding a fresh selection.
    //   3. DEFAULT_ROLE / first assigned role — final fallback.
    const stored = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { lastActiveRole: true },
    });

    let activeRole: string;

    if (initialRole && roleNames.includes(initialRole)) {
      // Client explicitly chose a role — always honour it.
      activeRole = initialRole;
    } else if (stored?.lastActiveRole && roleNames.includes(stored.lastActiveRole)) {
      // No explicit selection — restore the last known role for this user.
      activeRole = stored.lastActiveRole;
    } else {
      // Fallback: default role or first assigned role.
      activeRole = roleNames.includes(DEFAULT_ROLE) ? DEFAULT_ROLE : roleNames[0]!;
    }

    // Persist chosen active role
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastActiveRole: activeRole },
    });

    const { accessToken } = this.signToken(user.id, activeRole, roleNames);

    const profile = await this.profiles.findByUserId(user.id);

    return {
      accessToken,
      profile,
      isNewUser,
      activeRole,
      roles: roleNames,
    };
  }

  // ─── Role bootstrapping ───────────────────────────────────────────────────────

  private async ensureDefaultRole(userId: string, isNewUser: boolean): Promise<void> {
    if (!isNewUser) return;

    // Grant every base role up front. grantRole() is an idempotent upsert,
    // so this is safe even if one of them was already granted (e.g. via
    // `initialRole` a moment earlier in finaliseAuth).
    await Promise.all(BASE_ROLES.map((role) => this.rolesService.grantRole(userId, role)));
  }

  // ─── Internals ────────────────────────────────────────────────────────────────

  private async enforceFlowGuard(
    channel: OtpChannel,
    flow: AuthFlow,
    tx?: PrismaTx,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const field = this.identifierField(channel);
    const existing = await client.user.findUnique({ where: field });

    if (flow === 'signup' && existing) {
      throw new BadRequestException(
        'An account with this identifier already exists. Please log in.',
      );
    }

    if (flow === 'login' && !existing) {
      throw new UnauthorizedException('No account found. Please sign up first.');
    }
  }

  private async enforceRateLimit(
    channel: OtpChannel,
    purpose: OtpPurpose,
  ): Promise<void> {
    const windowMs =
      purpose === 'password_reset'
        ? this.PASSWORD_RESET_RATE_LIMIT_MS
        : this.OTP_RATE_LIMIT_MS;
    const since = new Date(Date.now() - windowMs);
    const recent = await this.prisma.oTPCode.findFirst({
      where: {
        ...this.identifierField(channel),
        purpose,
        createdAt: { gt: since },
      },
    });

    if (recent) {
      const noun = purpose === 'password_reset' ? 'reset code' : 'OTP';
      throw new BadRequestException(`Please wait before requesting another ${noun}`);
    }
  }

  private async dispatchOtp(channel: OtpChannel, code: string): Promise<void> {
    if (channel.via === 'phone') {
      await this.sms.sendSms(channel.identifier, otpSmsTemplate(code));
    } else {
      await this.email.sendEmail(
        channel.identifier,
        'Your Globecart OTP',
        'Please enable HTML to view this email.',
        otpEmailTemplate(code),
      );
    }
  }

  private async resolveUser(
    tx: PrismaTx,
    channel: OtpChannel,
    flow: AuthFlow,
  ): Promise<{ user: User; isNewUser: boolean }> {
    const field = this.identifierField(channel);

    if (flow === 'signup') {
      const existing = await tx.user.findUnique({ where: field });
      if (existing) {
        throw new ConflictException(
          'Account creation conflicted with a concurrent request. Please try again.',
        );
      }
      const user = await tx.user.create({ data: field });
      return { user, isNewUser: true };
    }

    await this.enforceFlowGuard(channel, flow, tx);
    const user = await tx.user.findUniqueOrThrow({ where: field });
    return { user, isNewUser: false };
  }

  private async attachSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return;

    if (session.role) {
      await this.rolesService.grantRole(userId, session.role).catch(() => {});
    }

    await this.sessions.attachUser(sessionId, userId);
  }

  private identifierField(
    channel: OtpChannel,
  ): { phone: string } | { email: string } {
    return channel.via === 'phone'
      ? { phone: channel.identifier }
      : { email: channel.identifier };
  }

  private signToken(
    userId: string,
    activeRole: string,
    roles: string[],
  ): { accessToken: string } {
    return {
      accessToken: this.jwt.sign({ sub: userId, activeRole, roles }),
    };
  }
}