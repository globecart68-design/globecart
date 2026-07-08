// src/modules/business-user/inventory/business-inventory.module.ts

import { Module } from '@nestjs/common';
import { BusinessInventoryController } from './business-inventory.controller';
import { BusinessInventoryService } from './business-inventory.service';
import { PrismaModule } from '../../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BusinessInventoryController],
  providers: [BusinessInventoryService],
})
export class BusinessInventoryModule {}
