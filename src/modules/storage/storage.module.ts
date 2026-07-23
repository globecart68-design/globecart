// src/modules/storage/storage.module.ts
//
// Was never created — five other modules import { StorageModule } from
// here (business-products, business-profile, business-onboarding,
// personal-users/profile, music, posts, stories) but the file didn't
// exist, so the whole app failed to compile. StorageService has no
// controller of its own; it's a pure provider consumed by other modules.

import { Module } from '@nestjs/common';
import { StorageService } from './storage.service';

@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
