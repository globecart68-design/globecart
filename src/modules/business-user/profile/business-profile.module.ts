import { Module } from '@nestjs/common';
import { BusinessProfileController } from './business-profile.controller';
import { BusinessProfileService } from './business-profile.service';
import { OperatingHoursService } from './operating-hours.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [BusinessProfileController],
  providers: [BusinessProfileService, OperatingHoursService],
})
export class BusinessProfileModule {}