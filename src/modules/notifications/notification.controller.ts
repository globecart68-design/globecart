// notifications/notification.controller.ts
import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { DeviceTokenService } from './device-token.service';
import { IsString, IsIn } from 'class-validator';

class RegisterTokenDto {
  @IsString() token!: string;
  @IsIn(['ios', 'android', 'web']) platform!: 'ios' | 'android' | 'web';
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(
    private readonly notifications: NotificationService,
    private readonly deviceTokens: DeviceTokenService,
  ) {}

  @Get()
  getInbox(
    @CurrentUser('id') userId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.notifications.getInbox(userId, +page, +limit);
  }

  @Patch(':id/read')
  markRead(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.notifications.markRead(userId, id);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser('id') userId: string) {
    return this.notifications.markAllRead(userId);
  }

  @Post('device-token')
  registerToken(@CurrentUser('id') userId: string, @Body() dto: RegisterTokenDto) {
    return this.deviceTokens.register({ userId, ...dto });
  }

  @Delete('device-token/:token')
  unregisterToken(@CurrentUser('id') userId: string, @Param('token') token: string) {
    return this.deviceTokens.unregister(userId, token);
  }
}