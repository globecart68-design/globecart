// src/modules/business-user/products/business-products.module.ts

import { Module } from '@nestjs/common';
import { BusinessProductsController } from './business-products.controller';
import { BusinessProductsService } from './business-products.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { StorageModule } from '../../storage/storage.module';

@Module({
  imports: [PrismaModule, StorageModule],
  controllers: [BusinessProductsController],
  providers: [BusinessProductsService],
})
export class BusinessProductsModule {}