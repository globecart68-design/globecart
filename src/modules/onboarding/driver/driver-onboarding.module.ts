import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RolesModule } from '../../roles/roles.module';
import { DriverOnboardingService } from './driver-onboarding.service';
import { DriverOnboardingController } from './driver-onboarding.controller';

@Module({
  imports: [PrismaModule, RolesModule],
  controllers: [DriverOnboardingController],
  providers: [DriverOnboardingService],
  exports: [DriverOnboardingService],
})
export class DriverOnboardingModule {}
