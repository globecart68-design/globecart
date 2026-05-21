import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { BlocksModule } from '../blocks/blocks.module';
import { GhostGuard } from '../../../../common/guards/ghost.guard';

@Module({
  imports: [BlocksModule],
  controllers: [FriendsController],
  providers: [FriendsService, GhostGuard],
})
export class FriendsModule {}