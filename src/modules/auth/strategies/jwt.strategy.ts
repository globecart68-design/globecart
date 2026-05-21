import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  /** The role the user is currently operating under, e.g. "user" | "driver" | "business_owner" */
  activeRole: string;
  /** All roles assigned to this user at token-issue time */
  roles: string[];
}

/** Shape attached to request.user after JWT validation */
export interface AuthenticatedUser {
  id: string;
  email: string | null;
  phone: string | null;
  createdAt: Date;
  /** Active role carried in this token */
  activeRole: string;
  /** Snapshot of all roles at issue time (use switch-role to refresh) */
  roles: string[];
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'dev_secret',
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });
    if (!user) throw new UnauthorizedException('User not found');

    return {
      ...user,
      activeRole: payload.activeRole,
      roles: payload.roles,
    };
  }
}
