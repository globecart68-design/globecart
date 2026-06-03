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
  getFriends(@CurrentUser() user: any) {
    return this.friendsService.getFriends(user.id);
  }

  @Get('requests/incoming')
  @UseGuards(GhostGuard)
  getIncomingRequests(@CurrentUser() user: any) {
    return this.friendsService.getIncomingRequests(user.id);
  }

  @Get('requests/outgoing')
  getOutgoingRequests(@CurrentUser() user: any) {
    return this.friendsService.getOutgoingRequests(user.id);
  }

  @Post('request/:targetUserId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  sendRequest(
    @CurrentUser() user: any,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.friendsService.sendRequest(user.id, targetUserId);
  }

  // ─── Cancel Outgoing Request ─────────────────────────────────────────────
  // IMPORTANT: must be before @Delete(':targetUserId') to avoid route clash
  @Delete('request/:targetUserId')
  @HttpCode(HttpStatus.OK)
  cancelRequest(
    @CurrentUser() user: any,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.friendsService.cancelRequest(user.id, targetUserId);
  }

  @Post('accept/:requesterId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  acceptRequest(
    @CurrentUser() user: any,
    @Param('requesterId') requesterId: string,
  ) {
    return this.friendsService.acceptRequest(user.id, requesterId);
  }

  @Post('reject/:requesterId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  rejectRequest(
    @CurrentUser() user: any,
    @Param('requesterId') requesterId: string,
  ) {
    return this.friendsService.rejectRequest(user.id, requesterId);
  }

  @Delete(':targetUserId')
  @UseGuards(BlockGuard)
  @HttpCode(HttpStatus.OK)
  unfriend(
    @CurrentUser() user: any,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.friendsService.unfriend(user.id, targetUserId);
  }
}  // ← class closes here