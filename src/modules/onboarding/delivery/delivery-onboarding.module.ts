import { Module } from '@nestjs/common';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RolesModule } from '../../roles/roles.module';
import { DeliveryOnboardingService } from './delivery-onboarding.service';
import { DeliveryOnboardingController } from './delivery-onboarding.controller';

@Module({
  imports: [PrismaModule, RolesModule],
  controllers: [DeliveryOnboardingController],
  providers: [DeliveryOnboardingService],
  exports: [DeliveryOnboardingService],
})
export class DeliveryOnboardingModule {}
