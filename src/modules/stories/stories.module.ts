// src/modules/stories/stories.module.ts

import { Module } from '@nestjs/common';
import { StoriesController } from './stories.controller';
import { StoriesService } from './stories.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [StoriesController],
  providers: [StoriesService],
})
export class StoriesModule {}