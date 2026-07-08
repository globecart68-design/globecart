import { Module } from '@nestjs/common';
import { BusinessAnalyticsController } from './business-analytics.controller';
import { BusinessAnalyticsService } from './business-analytics.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessAnalyticsController],
  providers: [BusinessAnalyticsService],
})
export class BusinessAnalyticsModule {}