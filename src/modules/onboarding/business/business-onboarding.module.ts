import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RolesModule } from '../../roles/roles.module';
import { StorageModule } from '../../storage/storage.module';
import { BusinessOnboardingService } from './business-onboarding.service';
import { BusinessOnboardingController } from './business-onboarding.controller';

@Module({
  imports: [PrismaModule, RolesModule, StorageModule],
  controllers: [BusinessOnboardingController],
  providers: [BusinessOnboardingService],
  exports: [BusinessOnboardingService],
})
export class BusinessOnboardingModule {}
