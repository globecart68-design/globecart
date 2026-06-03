import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../../common/decorators/current-user.decorator';
import { ShopsService } from './shops.service';

@Controller('shops')
@UseGuards(JwtAuthGuard)
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  /**
   * POST /shops/:shopId/favorite
   * Add a shop to the authenticated user's favorites.
   */
  @Post(':shopId/favorite')
  @HttpCode(HttpStatus.OK)
  favoriteShop(
    @CurrentUser() user: any,
    @Param('shopId') shopId: string,
  ) {
    return this.shopsService.favoriteShop(user.id, shopId);
  }

  /**
   * DELETE /shops/:shopId/favorite
   * Remove a shop from the authenticated user's favorites.
   */
  @Delete(':shopId/favorite')
  @HttpCode(HttpStatus.OK)
  unfavoriteShop(
    @CurrentUser() user: any,
    @Param('shopId') shopId: string,
  ) {
    return this.shopsService.unfavoriteShop(user.id, shopId);
  }

  /**
   * GET /shops/favorites
   * List all shops favorited by the authenticated user.
   */
  @Get('favorites')
  getFavoriteShops(@CurrentUser() user: any) {
    return this.shopsService.getFavoriteShops(user.id);
  }
}