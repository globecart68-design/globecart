// src/modules/business-user/products/business-products.service.ts

import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { CreateProductDto, ProductDto } from './dto/product.dto';

@Injectable()
export class BusinessProductsService {
  private readonly logger = new Logger(BusinessProductsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

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

  /** Resolve a product and assert the authenticated user owns its business. */
  private async resolveOwnedProduct(userId: string, productId: string) {
    const businessId = await this.resolveBusinessId(userId);

    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, businessId: true },
    });

    if (!product) throw new NotFoundException('Product not found.');
    if (product.businessId !== businessId) {
      throw new ForbiddenException('You do not own this product.');
    }

    return { businessId };
  }

  // ─── Create ─────────────────────────────────────────────────────────────────

  async createProduct(
    userId: string,
    dto: CreateProductDto,
  ): Promise<ProductDto> {
    const businessId = await this.resolveBusinessId(userId);

    const stockValue = dto.stock ?? 0;
    const trackInventory = dto.trackInventory ?? true;

    const product = await this.prisma.product.create({
      data: {
        businessId,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        comparePrice: dto.comparePrice ?? null,
        category: dto.category,
        sku: dto.sku ?? null,
        stock: stockValue,
        trackInventory,
        imageUrl: dto.imageUrl ?? null,
        isActive: dto.isActive ?? true,
        taxable: dto.taxable ?? true,
        taxClass: dto.taxClass ?? null,
        weight: dto.weight ?? null,
        length: dto.length ?? null,
        width: dto.width ?? null,
        height: dto.height ?? null,
        shippingClass: dto.shippingClass ?? null,
        attributes: dto.attributes ?? undefined,
        variants:
          dto.variants && dto.variants.length > 0
            ? {
                create: dto.variants.map((v) => ({
                  name: v.name,
                  sku: v.sku ?? null,
                  priceDelta: v.priceDelta ?? 0,
                  stock: v.stock ?? 0,
                  attributes: v.attributes ?? undefined,
                })),
              }
            : undefined,
      },
      include: { variants: true, images: true },
    });

    // Ensure an Inventory record exists for this product, unless inventory
    // tracking has been disabled (e.g. made-to-order items, services).
    if (trackInventory) {
      try {
        await this.prisma.inventory.create({
          data: {
            productId: product.id,
            businessId,
            currentStock: stockValue,
            minStock: 0,
            maxStock: stockValue > 0 ? Math.max(stockValue * 2, 100) : 100,
          },
        });
      } catch (e) {
        // Log but don't fail the product creation if inventory creation fails
        this.logger.warn(
          `Failed to create inventory for product ${product.id}: ${e}`,
        );
      }
    }

    this.logger.log(
      `Product created: ${product.id} for business ${businessId}`,
    );

    return this.mapProduct(product);
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  async listProducts(userId: string): Promise<ProductDto[]> {
    const businessId = await this.resolveBusinessId(userId);

    const products = await this.prisma.product.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } },
    });

    return products.map((p) => this.mapProduct(p));
  }

  // ─── Images ─────────────────────────────────────────────────────────────────

  /**
   * Uploads an image for a product and appends it to the product's image
   * gallery (ordered by upload order).
   */
  async addProductImage(
    userId: string,
    productId: string,
    file: Express.Multer.File,
    altText?: string,
  ): Promise<ProductDto> {
    await this.resolveOwnedProduct(userId, productId);

    const url = await this.storage.uploadAvatar(file);
    const existingCount = await this.prisma.productImage.count({
      where: { productId },
    });

    await this.prisma.productImage.create({
      data: {
        productId,
        url,
        altText: altText ?? null,
        sortOrder: existingCount,
      },
    });

    this.logger.log(`Image added to product ${productId}`);

    return this.getProductOrThrow(productId);
  }

  /** Removes a single image from a product's gallery. */
  async deleteProductImage(
    userId: string,
    productId: string,
    imageId: string,
  ): Promise<ProductDto> {
    await this.resolveOwnedProduct(userId, productId);

    const image = await this.prisma.productImage.findUnique({
      where: { id: imageId },
    });

    if (image && image.productId === productId) {
      try {
        await this.storage.deleteFile(image.url);
      } catch (e) {
        this.logger.warn(`Failed to delete file for image ${imageId}: ${e}`);
      }
      await this.prisma.productImage.delete({ where: { id: imageId } });
    }

    return this.getProductOrThrow(productId);
  }

  // ─── Delete ──────────────────────────────────────────────────────────────────

  async deleteProduct(userId: string, productId: string): Promise<void> {
    const { businessId } = await this.resolveOwnedProduct(userId, productId);

    // Delete the inventory record(s) for this product first so the product
    // delete never fails on a foreign key constraint, regardless of how (or
    // whether) the Prisma relation's onDelete behavior is configured.
    // Variants and images cascade automatically via the schema.
    await this.prisma.$transaction([
      this.prisma.inventory.deleteMany({ where: { productId } }),
      this.prisma.product.delete({ where: { id: productId } }),
    ]);

    this.logger.log(
      `Product deleted: ${productId} for business ${businessId}`,
    );
  }

  // ─── Mapper ──────────────────────────────────────────────────────────────────

  private async getProductOrThrow(productId: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: true, images: { orderBy: { sortOrder: 'asc' } } },
    });

    if (!product) throw new NotFoundException('Product not found.');

    return this.mapProduct(product);
  }

  private mapProduct(p: any): ProductDto {
    return {
      id: p.id,
      businessId: p.businessId,
      name: p.name,
      description: p.description,
      price: Number(p.price),
      comparePrice: p.comparePrice !== null ? Number(p.comparePrice) : null,
      category: p.category,
      sku: p.sku,
      stock: p.stock,
      trackInventory: p.trackInventory,
      imageUrl: p.imageUrl,
      isActive: p.isActive,
      taxable: p.taxable,
      taxClass: p.taxClass,
      weight: p.weight !== null && p.weight !== undefined ? Number(p.weight) : null,
      length: p.length !== null && p.length !== undefined ? Number(p.length) : null,
      width: p.width !== null && p.width !== undefined ? Number(p.width) : null,
      height: p.height !== null && p.height !== undefined ? Number(p.height) : null,
      shippingClass: p.shippingClass,
      attributes: p.attributes ?? null,
      variants: (p.variants ?? []).map((v: any) => ({
        id: v.id,
        productId: v.productId,
        name: v.name,
        sku: v.sku,
        priceDelta: Number(v.priceDelta),
        stock: v.stock,
        attributes: v.attributes ?? null,
        createdAt: v.createdAt,
      })),
      images: (p.images ?? []).map((img: any) => ({
        id: img.id,
        productId: img.productId,
        url: img.url,
        altText: img.altText,
        sortOrder: img.sortOrder,
        createdAt: img.createdAt,
      })),
      createdAt: p.createdAt,
    };
  }
}