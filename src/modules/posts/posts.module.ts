// src/modules/posts/posts.module.ts

import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';
import { StorageModule } from '../storage/storage.module';
import { MusicModule } from '../music/music.module';

@Module({
  imports: [StorageModule, MusicModule],
  controllers: [PostsController],
  providers: [PostsService],
})
export class PostsModule {}
