// src/modules/music/music.module.ts

import { Module } from '@nestjs/common';
import { MusicController } from './music.controller';
import { MusicService } from './music.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [MusicController],
  providers: [MusicService],
  exports: [MusicService], // PostsModule / StoriesModule need this for `use()` + createOriginalSound()
})
export class MusicModule {}
