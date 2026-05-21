import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedUser } from '../../modules/auth/strategies/jwt.strategy';

/**
 * RolesGuard — checks the required roles (set via @Roles()) against the
 * `activeRole` embedded in the signed JWT.
 *
 * ✓ No extra DB call — the role is part of the stateless token.
 * ✓ Works at handler or controller level.
 * ✓ Always combine with JwtAuthGuard: @UseGuards(JwtAuthGuard, RolesGuard).
 *
 * When the user needs to act under a different role, they call
 * POST /auth/switch-role to get a new token and swap it in.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>('roles', [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = req.user;

    if (!user) throw new ForbiddenException('Authentication required');

    if (!required.includes(user.activeRole)) {
      throw new ForbiddenException(
        `This action requires one of the following roles: [${required.join(', ')}]. ` +
          `Your active role is "${user.activeRole}". ` +
          `Call POST /auth/switch-role to change it.`,
      );
    }

    return true;
  }
}
