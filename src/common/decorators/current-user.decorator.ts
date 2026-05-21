import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from '../../modules/auth/strategies/jwt.strategy';

/**
 * Injects the full authenticated user (including activeRole & roles snapshot).
 *
 * Usage:
 *   @Get('me')
 *   getMe(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 *   // Or pick a specific field:
 *   @Get('id')
 *   getId(@CurrentUser('id') id: string) { ... }
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthenticatedUser = request.user;
    return field ? user[field] : user;
  },
);

/**
 * Convenience decorator — injects only the active role string.
 *
 * Usage:
 *   @Get('dashboard')
 *   getDashboard(@ActiveRole() role: string) { ... }
 */
export const ActiveRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return (request.user as AuthenticatedUser).activeRole;
  },
);
