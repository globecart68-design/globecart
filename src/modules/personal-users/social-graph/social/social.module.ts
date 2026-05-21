import { Module } from '@nestjs/common';
import { SocialController } from './social.controller';
import { SocialService } from './social.service';
import { BlocksModule } from '../blocks/blocks.module';
import { GhostGuard } from '../../../../common/guards/ghost.guard';

@Module({
  imports: [BlocksModule],
  controllers: [SocialController],
  providers: [SocialService, GhostGuard],
})
export class SocialModule {}