// src/modules/business-user/products/dto/product.dto.ts

import {
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  IsOptional,
  IsInt,
  IsBoolean,
  IsObject,
  IsArray,
  ValidateNested,
  MaxLength,
  IsUrl,
} from 'class-validator';
import { Type } from 'class-transformer';

// ─── Variants ──────────────────────────────────────────────────────────────────

export class ProductVariantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string; // e.g. "Size: Large / Color: Blue"

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  /** Added to (or subtracted from) the base product price. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  priceDelta?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;
}

// ─── Create ──────────────────────────────────────────────────────────────────

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  comparePrice?: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  category!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  sku?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  /** When false, this product is made-to-order / a service — stock isn't tracked. */
  @IsOptional()
  @IsBoolean()
  trackInventory?: boolean;

  /** Pre-uploaded image URL (optional — client uploads image separately) */
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  // ── Taxation ────────────────────────────────────────────────────────────

  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxClass?: string;

  // ── Shipping & dimensions ───────────────────────────────────────────────

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  weight?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  length?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  width?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  height?: number;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  shippingClass?: string;

  // ── Business-type-specific fields + custom metadata ────────────────────

  @IsOptional()
  @IsObject()
  attributes?: Record<string, any>;

  // ── Variants ─────────────────────────────────────────────────────────

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductVariantDto)
  variants?: ProductVariantDto[];
}

// ─── Response shapes ──────────────────────────────────────────────────────────

export interface ProductVariantResponseDto {
  id: string;
  productId: string;
  name: string;
  sku: string | null;
  priceDelta: number;
  stock: number;
  attributes: Record<string, any> | null;
  createdAt: Date;
}

export interface ProductImageResponseDto {
  id: string;
  productId: string;
  url: string;
  altText: string | null;
  sortOrder: number;
  createdAt: Date;
}

export interface ProductDto {
  id: string;
  businessId: string;
  name: string;
  description: string | null;
  price: number;
  comparePrice: number | null;
  category: string;
  sku: string | null;
  stock: number;
  trackInventory: boolean;
  imageUrl: string | null;
  isActive: boolean;
  taxable: boolean;
  taxClass: string | null;
  weight: number | null;
  length: number | null;
  width: number | null;
  height: number | null;
  shippingClass: string | null;
  attributes: Record<string, any> | null;
  variants: ProductVariantResponseDto[];
  images: ProductImageResponseDto[];
  createdAt: Date;
}