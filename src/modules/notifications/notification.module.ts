// notifications/notification.module.ts
import { Module } from '@nestjs/common';
import { SnsService } from './sns.service';
import { NotificationService } from './notification.service';
import { DeviceTokenService } from './device-token.service';
import { NotificationController } from './notification.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationController],
  providers: [SnsService, NotificationService, DeviceTokenService],
  exports: [NotificationService, DeviceTokenService], // export so other modules can call send() / clean up tokens
})
export class NotificationModule {}