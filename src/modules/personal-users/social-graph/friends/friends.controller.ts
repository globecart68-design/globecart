import {
  Controller,
  Post,
  Delete,
  Get,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { BlockGuard } from '../../../../common/guards/blocks.guard';
import { GhostGuard } from '../../../../common/guards/ghost.guard';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { FriendsService } from './friends.service';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly friendsService: FriendsService) {}

  @Get()
  getFriends(@CurrentUser() userId: string) {
    return this.friendsService.getFriends(userId);
  }

  @Get('requests/incoming')
  @UseGuards(GhostGuard)
  getIncomingRequests(@CurrentUser() userId: string) {
    return this.friendsService.getIncomingRequests(userId);
  }

  @Get('requests/outgoing')
  getOutgoingRequests(@CurrentUser() userId: string) {
    return this.friendsService.getOutgoingRequests(userId);
  }

  @Post('request/:targetUserId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  sendRequest(
    @CurrentUser() userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.friendsService.sendRequest(userId, targetUserId);
  }

  // ─── Cancel Outgoing Request ─────────────────────────────────────────────
  // IMPORTANT: must be before @Delete(':targetUserId') to avoid route clash
  @Delete('request/:targetUserId')
  @HttpCode(HttpStatus.OK)
  cancelRequest(
    @CurrentUser() userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.friendsService.cancelRequest(userId, targetUserId);
  }

  @Post('accept/:requesterId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  acceptRequest(
    @CurrentUser() userId: string,
    @Param('requesterId') requesterId: string,
  ) {
    return this.friendsService.acceptRequest(userId, requesterId);
  }

  @Post('reject/:requesterId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @CurrentUser() userId: string,
    @Param('requesterId') requesterId: string,
  ) {
    return this.friendsService.rejectRequest(userId, requesterId);
  }

  @Delete(':targetUserId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  unfriend(
    @CurrentUser() userId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.friendsService.unfriend(userId, targetUserId);
  }
}  // ← class closes here