import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';
import { ProfileService } from './profile.service';
import { ProfileController } from './profile.controller'; 

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [ProfileController], // ← add this
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}