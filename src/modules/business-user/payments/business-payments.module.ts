import { Module } from '@nestjs/common';
import { BusinessPaymentsController } from './business-payments.controller';
import { BusinessPaymentsService } from './business-payments.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessPaymentsController],
  providers: [BusinessPaymentsService],
})
export class BusinessPaymentsModule {}