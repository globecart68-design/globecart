// src/modules/business-user/inventory/dto/inventory.dto.ts

export class InventoryItemDto {
  id: string;
  productId: string;
  productName: string;
  category: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  price: number;
  sku?: string;
  imageUrl?: string;
  lastRestockedAt: Date;
  createdAt: Date;
}

export class UpdateStockDto {
  stock: number;
}

export class UpdateStockLevelsDto {
  minStock: number;
  maxStock: number;
}
