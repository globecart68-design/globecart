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
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { BlocksService } from './blocks.service';

@Controller('blocks')
@UseGuards(JwtAuthGuard)
export class BlocksController {
  constructor(private readonly blocksService: BlocksService) {}

  /**
   * POST /blocks/:targetUserId
   * Block a user. Cleans up follow and friend rows automatically.
   */
  @Post(':targetUserId')
  @HttpCode(HttpStatus.OK)
  blockUser(
    @CurrentUser() user: { id: string },
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.blocksService.blockUser(user.id, targetUserId);
  }

  /**
   * DELETE /blocks/:targetUserId
   * Unblock a previously blocked user.
   */
  @Delete(':targetUserId')
  @HttpCode(HttpStatus.OK)
  unblockUser(
    @CurrentUser() user: { id: string },
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.blocksService.unblockUser(user.id, targetUserId);
  }

  /**
   * GET /blocks
   * List all users the authenticated user has blocked.
   */
  @Get()
  getBlockedUsers(@CurrentUser() user: { id: string }) {
    return this.blocksService.getBlockedUsers(user.id);
  }
}