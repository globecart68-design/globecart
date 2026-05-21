import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { BlocksService } from '../../modules/personal-users/social-graph/blocks/blocks.service';

/**
 * Prevents a blocked user from interacting with the blocker.
 *
 * Expects the target userId to be in:
 *   - req.params.targetUserId  (most routes)
 *   - req.params.userId        (profile / list routes)
 *   - req.body.targetId        (report route)
 *
 * Usage:
 * ```ts
 * @UseGuards(JwtAuthGuard, BlockGuard)
 * @Post('message/:targetUserId')
 * ```
 */
@Injectable()
export class BlockGuard implements CanActivate {
  constructor(private readonly blocksService: BlocksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const callerId: string = req.user?.id;

    const targetId: string =
      req.params?.targetUserId ??
      req.params?.userId ??
      req.body?.targetId;

    if (!callerId || !targetId || callerId === targetId) return true;

    const blocked = await this.blocksService.isBlocked(callerId, targetId);
    if (blocked) {
      throw new ForbiddenException('You cannot interact with this user.');
    }

    return true;
  }
}