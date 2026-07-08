// src/modules/business-user/products/business-products.controller.ts

import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/strategies/jwt.strategy';
import { BusinessProductsService } from './business-products.service';
import { CreateProductDto } from './dto/product.dto';

@UseGuards(JwtAuthGuard)
@Controller('business/products')
export class BusinessProductsController {
  constructor(private readonly service: BusinessProductsService) {}

  /**
   * POST /business/products
   *
   * Create a new product for the authenticated business owner.
   */
  @Post()
  createProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ) {
    return this.service.createProduct(user.id, dto);
  }

  /**
   * GET /business/products
   *
   * List all products for the authenticated business owner.
   */
  @Get()
  listProducts(@CurrentUser() user: AuthenticatedUser) {
    return this.service.listProducts(user.id);
  }

  /**
   * POST /business/products/:id/images
   *
   * Uploads and appends an image to a product's gallery.
   * Max file size: 8 MB. Supported types: JPEG, PNG, WebP.
   */
  @Post(':id/images')
  @UseInterceptors(FileInterceptor('image'))
  addProductImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 8 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /^image\/(jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Query('altText') altText?: string,
  ) {
    return this.service.addProductImage(user.id, productId, file, altText);
  }

  /**
   * DELETE /business/products/:id/images/:imageId
   *
   * Removes a single image from a product's gallery.
   */
  @Delete(':id/images/:imageId')
  deleteProductImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
    @Param('imageId') imageId: string,
  ) {
    return this.service.deleteProductImage(user.id, productId, imageId);
  }

  /**
   * DELETE /business/products/:id
   *
   * Delete a product owned by the authenticated business.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteProduct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') productId: string,
  ) {
    return this.service.deleteProduct(user.id, productId);
  }
}