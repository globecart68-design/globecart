// src/modules/business-user/inventory/business-inventory.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  InventoryItemDto,
  UpdateStockDto,
  UpdateStockLevelsDto,
} from './dto/inventory.dto';

@Injectable()
export class BusinessInventoryService {
  private readonly logger = new Logger(BusinessInventoryService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Resolve the owner's primary business and assert ownership. */
  private async resolveBusinessId(userId: string): Promise<string> {
    const business = await this.prisma.business.findFirst({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    if (!business) {
      throw new NotFoundException('No business found for this account.');
    }

    return business.id;
  }

  // ─── Get Inventory List ──────────────────────────────────────────────────────

  async getInventory(userId: string): Promise<InventoryItemDto[]> {
    const businessId = await this.resolveBusinessId(userId);

    const inventory = await this.prisma.inventory.findMany({
      where: { businessId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            sku: true,
            imageUrl: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return inventory.map(this.mapInventoryItem);
  }

  // ─── Update Stock ────────────────────────────────────────────────────────────

  async updateStock(
    userId: string,
    inventoryItemId: string,
    dto: UpdateStockDto,
  ): Promise<InventoryItemDto> {
    const businessId = await this.resolveBusinessId(userId);

    // Verify ownership
    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryItemId },
      select: { businessId: true, productId: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found.');
    }

    if (inventory.businessId !== businessId) {
      throw new ForbiddenException('You do not own this inventory.');
    }

    // Update inventory and product stock
    const updated = await this.prisma.inventory.update({
      where: { id: inventoryItemId },
      data: {
        currentStock: dto.stock,
        lastRestockedAt: new Date(),
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            sku: true,
            imageUrl: true,
          },
        },
      },
    });

    // Also update the product stock field
    await this.prisma.product.update({
      where: { id: inventory.productId },
      data: { stock: dto.stock },
    });

    this.logger.log(
      `Inventory stock updated: ${inventoryItemId} to ${dto.stock}`,
    );

    return this.mapInventoryItem(updated);
  }

  // ─── Update Stock Levels (min/max) ───────────────────────────────────────────

  async updateStockLevels(
    userId: string,
    inventoryItemId: string,
    dto: UpdateStockLevelsDto,
  ): Promise<InventoryItemDto> {
    const businessId = await this.resolveBusinessId(userId);

    // Verify ownership
    const inventory = await this.prisma.inventory.findUnique({
      where: { id: inventoryItemId },
      select: { businessId: true },
    });

    if (!inventory) {
      throw new NotFoundException('Inventory item not found.');
    }

    if (inventory.businessId !== businessId) {
      throw new ForbiddenException('You do not own this inventory.');
    }

    const updated = await this.prisma.inventory.update({
      where: { id: inventoryItemId },
      data: {
        minStock: dto.minStock,
        maxStock: dto.maxStock,
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            category: true,
            price: true,
            sku: true,
            imageUrl: true,
          },
        },
      },
    });

    this.logger.log(
      `Inventory levels updated: ${inventoryItemId} - min: ${dto.minStock}, max: ${dto.maxStock}`,
    );

    return this.mapInventoryItem(updated);
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────────

  private mapInventoryItem(item: any): InventoryItemDto {
    return {
      id: item.id,
      productId: item.product.id,
      productName: item.product.name,
      category: item.product.category,
      currentStock: item.currentStock,
      minStock: item.minStock,
      maxStock: item.maxStock,
      price: item.product.price,
      sku: item.product.sku,
      imageUrl: item.product.imageUrl,
      lastRestockedAt: item.lastRestockedAt,
      createdAt: item.createdAt,
    };
  }
}
