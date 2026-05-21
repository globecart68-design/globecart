// src/common/guards/ghost.guard.ts

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BlocksService } from '../../modules/personal-users/social-graph/blocks/blocks.service';

/**
 * Ghost guard — if a block exists in either direction between the caller
 * and the target, returns 404 "User not found" instead of 403.
 * This prevents the caller from knowing they have been blocked.
 *
 * Reads targetId from:
 *   - req.params.userId
 *   - req.params.targetUserId
 */
@Injectable()
export class GhostGuard implements CanActivate {
  constructor(private readonly blocksService: BlocksService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const callerId: string = req.user?.id;

    const targetId: string =
      req.params?.userId ??
      req.params?.targetUserId;

    if (!callerId || !targetId || callerId === targetId) return true;

    const blocked = await this.blocksService.isBlocked(callerId, targetId);
    if (blocked) {
      throw new NotFoundException('User not found.');
    }

    return true;
  }
}