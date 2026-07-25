import { Module } from '@nestjs/common';
import { BusinessOrdersController } from './business-orders.controller';
import { BusinessOrdersService } from './business-orders.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessOrdersController],
  providers: [BusinessOrdersService],
})
export class BusinessOrdersModule {}
