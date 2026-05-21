import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { BlockGuard } from '../../../../common/guards/blocks.guard';
import { GhostGuard } from '../../../../common/guards/ghost.guard';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { SocialService } from './social.service';

@Controller('social')
@UseGuards(JwtAuthGuard)
export class SocialController {
  constructor(private readonly socialService: SocialService) {}

  // ─────────────────────────────────────────────
  // Follow user
  // POST /social/follow/:targetUserId
  // ─────────────────────────────────────────────

  @Post('follow/:targetUserId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  follow(
    @CurrentUser() userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.socialService.follow(userId, targetUserId);
  }

  // ─────────────────────────────────────────────
  // Unfollow user
  // DELETE /social/follow/:targetUserId
  // ─────────────────────────────────────────────

  @Delete('follow/:targetUserId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  unfollow(
    @CurrentUser() userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.socialService.unfollow(userId, targetUserId);
  }

  // ─────────────────────────────────────────────
  // Suggested users
  // GET /social/suggestions
  // ─────────────────────────────────────────────

  @Get('suggestions')
  getSuggestions(@CurrentUser() userId: string) {
    return this.socialService.getSuggestedUsers(userId);
  }

  // ─────────────────────────────────────────────
  // Mutual follows
  // GET /social/:userId/mutual
  // ─────────────────────────────────────────────

  @Get(':userId/mutual')
  @UseGuards(GhostGuard)
  getMutualFollows(@Param('userId') userId: string) {
    return this.socialService.getMutualFollows(userId);
  }

  // ─────────────────────────────────────────────
  // Follow status checker (VERY important endpoint)
  // GET /social/status/:targetUserId
  // Used by Flutter Follow button UI
  // ─────────────────────────────────────────────

  @Get('status/:targetUserId')
  getFollowStatus(
    @CurrentUser() userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.socialService.getFollowStatus(userId, targetUserId);
  }

  // ─────────────────────────────────────────────
  // Followers list
  // GET /social/:userId/followers
  // ─────────────────────────────────────────────

  @Get(':userId/followers')
  @UseGuards(GhostGuard)
  getFollowers(@Param('userId') userId: string) {
    return this.socialService.getFollowers(userId);
  }

  // ─────────────────────────────────────────────
  // Following list
  // GET /social/:userId/following
  // ─────────────────────────────────────────────

  @Get(':userId/following')
  @UseGuards(GhostGuard)
  getFollowing(@Param('userId') userId: string) {
    return this.socialService.getFollowing(userId);
  }
}