import { Module } from '@nestjs/common';
import { BusinessHomeController } from './business-home.controller';
import { BusinessHomeService } from './business-home.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessHomeController],
  providers: [BusinessHomeService],
})
export class BusinessHomeModule {}
