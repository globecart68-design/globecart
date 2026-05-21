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
import { ProfileService } from '../personal-users/profile/profile.service';
import { ProfileDto } from '../personal-users/profile/dto/profile.dto';
import {
  SocialTokenVerifierService,
  SocialProvider,
} from './social-auth/social_token_verifier.service';

type PrismaTx = Prisma.TransactionClient;

type OtpChannel =
  | { via: 'phone'; identifier: string }
  | { via: 'email'; identifier: string };

type AuthFlow = 'signup' | 'login';

/** The default role every new account starts with. */
const DEFAULT_ROLE = 'user';

export type AuthResult = {
  accessToken: string;
  profile: ProfileDto;
  isNewUser: boolean;
  /** Active role encoded in this token */
  activeRole: string;
  /** All roles the user holds (used by the client to render the role switcher) */
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

  private static readonly OTP_CODE_RE = /^\d{6}$/;

  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly sms: SmsService,
    private readonly email: EmailService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly profiles: ProfileService,
    private readonly socialVerifier: SocialTokenVerifierService,
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
  }

  // ─── Send OTP ────────────────────────────────────────────────────────────────

  async sendOtp(
    channel: OtpChannel,
    flow: AuthFlow,
  ): Promise<{ message: string }> {
    await this.enforceRateLimit(channel);

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const hashedCode = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + this.OTP_EXPIRY_MS);
    const baseData = { code: hashedCode, attempts: 0, expiresAt };
    const channelData = this.identifierField(channel);

    await this.prisma.$transaction(async (tx) => {
      await this.enforceFlowGuard(channel, flow, tx);
      await tx.oTPCode.deleteMany({ where: channelData });
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
  ): Promise<AuthResult> {
    if (!AuthService.OTP_CODE_RE.test(code)) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    const identifierField = this.identifierField(channel);

    const otp = await this.prisma.oTPCode.findFirst({
      where: {
        ...identifierField,
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

    return this.finaliseAuth(user, isNewUser, sessionId);
  }

  // ─── Social Auth ─────────────────────────────────────────────────────────────

  async socialAuth(
    provider: SocialProvider,
    token: string,
    sessionId?: string,
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

      const userData = socialProfile.email ? { email: socialProfile.email } : {};
      const newUser = await tx.user.create({ data: userData });

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

    return this.finaliseAuth(user, isNewUser, sessionId);
  }

  // ─── Switch Role ──────────────────────────────────────────────────────────────

  /**
   * Issues a new JWT with a different `activeRole`.
   *
   * Rules:
   * - The user must actually hold the requested role in the database.
   * - The new token is identical to the old one except for `activeRole`.
   * - The client should replace its stored token with the new one.
   *
   * Why issue a new token instead of a session flag?
   * Keeping the role in the stateless JWT means every downstream service can
   * enforce role-based access without an extra DB call or a shared cache.
   */
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

    const { accessToken } = this.signToken(userId, requestedRole, roleNames);

    this.logger.log(`User ${userId} switched active role to "${requestedRole}"`);

    return { accessToken, activeRole: requestedRole, roles: roleNames };
  }

  // ─── Shared post-auth finalisation ───────────────────────────────────────────

  private async finaliseAuth(
    user: User,
    isNewUser: boolean,
    sessionId?: string,
  ): Promise<AuthResult> {
    // Ensure the default "user" role exists in the database.
    await this.ensureDefaultRole(user.id, isNewUser);

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

    // Load the full role list so the token reflects the current assignment.
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId: user.id },
      include: { role: true },
    });
    const roleNames = userRoles.map((ur) => ur.role.name);

    // New users always start as "user". Returning users keep their last active
    // role (defaulting to "user" if somehow absent).
    const activeRole = roleNames.includes(DEFAULT_ROLE) ? DEFAULT_ROLE : (roleNames[0] ?? DEFAULT_ROLE);

    const { accessToken } = this.signToken(user.id, activeRole, roleNames);
    const profile = await this.profiles.findByUserId(user.id);

    return { accessToken, profile, isNewUser, activeRole, roles: roleNames };
  }

  // ─── Role bootstrapping ───────────────────────────────────────────────────────

  /**
   * Guarantees the "user" role row exists globally, then assigns it to this
   * user if they don't already have it. Idempotent — safe to call on every login.
   */
  private async ensureDefaultRole(userId: string, isNewUser: boolean): Promise<void> {
    // Only auto-assign on first login; existing accounts should not be changed.
    if (!isNewUser) return;

    await this.prisma.$transaction(async (tx) => {
      // Create the role if it doesn't exist yet (e.g. fresh DB).
      const role = await tx.role.upsert({
        where: { name: DEFAULT_ROLE },
        update: {},
        create: { name: DEFAULT_ROLE },
      });

      await tx.userRole.upsert({
        where: { userId_roleId: { userId, roleId: role.id } },
        update: {},
        create: { userId, roleId: role.id },
      });
    });
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

  private async enforceRateLimit(channel: OtpChannel): Promise<void> {
    const since = new Date(Date.now() - this.OTP_RATE_LIMIT_MS);
    const recent = await this.prisma.oTPCode.findFirst({
      where: {
        ...this.identifierField(channel),
        createdAt: { gt: since },
      },
    });

    if (recent) {
      throw new BadRequestException('Please wait before requesting another OTP');
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

    if (!session) {
      this.logger.warn(
        `attachSession: session ${sessionId} not found — skipping`,
      );
      return;
    }

    if (session.role) {
      const role = await this.prisma.role.findUnique({ where: { name: session.role } });
      if (role) {
        await this.prisma.userRole.upsert({
          where: { userId_roleId: { userId, roleId: role.id } },
          update: {},
          create: { userId, roleId: role.id },
        });
      } else {
        this.logger.warn(
          `attachSession: role "${session.role}" not found — skipping role assignment`,
        );
      }
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
