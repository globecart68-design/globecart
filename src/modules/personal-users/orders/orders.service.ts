import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates an order for the authenticated customer.
   *
   * Prices, the minimum-order check, and stock availability are all
   * computed from the database, not the client payload — the client only
   * sends productId + quantity. Stock is re-checked and decremented
   * atomically inside the same transaction as order creation, so two
   * customers racing for the last unit can't both succeed.
   */
  async createOrder(customerId: string, dto: CreateOrderDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: dto.shopId },
      select: { id: true, isActive: true, minOrderAmount: true },
    });

    if (!business || !business.isActive) {
      throw new NotFoundException('Shop not found.');
    }

    const productIds = dto.items.map((item) => item.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, businessId: dto.shopId, isActive: true },
      select: { id: true, name: true, price: true, stock: true, trackInventory: true },
    });

    const productById = new Map(products.map((p) => [p.id, p]));
    const missing = productIds.filter((id) => !productById.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `Some items are no longer available: ${missing.join(', ')}`,
      );
    }

    // Reject up front if the requested quantity exceeds what's on hand for
    // any tracked-inventory product — gives a clear message instead of a
    // generic conflict, before we even open a transaction.
    const insufficient = dto.items
      .map((item) => ({ item, product: productById.get(item.productId)! }))
      .filter(
        ({ item, product }) =>
          product.trackInventory && item.quantity > product.stock,
      );

    if (insufficient.length > 0) {
      const details = insufficient
        .map(
          ({ item, product }) =>
            `${product.name} (requested ${item.quantity}, only ${product.stock} left)`,
        )
        .join(', ');
      throw new BadRequestException(
        `Not enough stock for: ${details}.`,
      );
    }

    let total = 0;
    const orderItemsData = dto.items.map((item) => {
      const product = productById.get(item.productId)!;
      const price = product.price;
      total += price * item.quantity;
      return {
        productId: item.productId,
        quantity: item.quantity,
        price,
      };
    });

    if (business.minOrderAmount != null && total < business.minOrderAmount) {
      throw new BadRequestException(
        `This shop requires a minimum order of $${business.minOrderAmount.toFixed(2)}. ` +
          `Your order total is $${total.toFixed(2)}.`,
      );
    }

    const order = await this.prisma.$transaction(async (tx) => {
      // Decrement stock for every tracked-inventory item, but only if it
      // still has enough left. The `stock: { gte: quantity }` guard makes
      // this atomic at the DB level — if a concurrent order already used
      // up the stock, updateMany affects 0 rows and we abort the whole
      // transaction rather than overselling.
      for (const item of dto.items) {
        const product = productById.get(item.productId)!;
        if (!product.trackInventory) continue;

        const result = await tx.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });

        if (result.count === 0) {
          throw new ConflictException(
            `${product.name} sold out while you were checking out. Please update your cart.`,
          );
        }

        // Keep the business inventory view in sync with the product's
        // stock, the same way manual restocks do.
        await tx.inventory.updateMany({
          where: { productId: item.productId, businessId: dto.shopId },
          data: { currentStock: { decrement: item.quantity } },
        });
      }

      return tx.order.create({
        data: {
          customerId,
          businessId: dto.shopId,
          total,
          items: { create: orderItemsData },
        },
        include: { items: true },
      });
    });

    return order;
  }
}
