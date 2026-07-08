import { Module } from '@nestjs/common';
import { BusinessCustomersController } from './business-customers.controller';
import { BusinessCustomersService } from './business-customers.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessCustomersController],
  providers: [BusinessCustomersService],
})
export class BusinessCustomersModule {}