// src/modules/business-user/inventory/business-inventory.controller.ts

import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { BusinessInventoryService } from './business-inventory.service';
import {
  UpdateStockDto,
  UpdateStockLevelsDto,
  InventoryItemDto,
} from './dto/inventory.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/inventory')
export class BusinessInventoryController {
  constructor(private readonly service: BusinessInventoryService) {}

  /**
   * GET /business/inventory
   *
   * Get all inventory items for the authenticated business owner.
   */
  @Get()
  getInventory(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<InventoryItemDto[]> {
    return this.service.getInventory(user.id);
  }

  /**
   * PATCH /business/inventory/:id/stock
   *
   * Update the stock quantity of an inventory item.
   */
  @Patch(':id/stock')
  @HttpCode(HttpStatus.OK)
  updateStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') inventoryItemId: string,
    @Body() dto: UpdateStockDto,
  ): Promise<InventoryItemDto> {
    return this.service.updateStock(user.id, inventoryItemId, dto);
  }

  /**
   * PATCH /business/inventory/:id/levels
   *
   * Update the min/max stock levels of an inventory item.
   */
  @Patch(':id/levels')
  @HttpCode(HttpStatus.OK)
  updateStockLevels(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') inventoryItemId: string,
    @Body() dto: UpdateStockLevelsDto,
  ): Promise<InventoryItemDto> {
    return this.service.updateStockLevels(user.id, inventoryItemId, dto);
  }
}
