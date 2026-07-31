import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { CartService } from "./cart.service";
import { AddCartItemDto } from "./dto/add-cart-item.dto";
import { UpdateCartItemDto } from "./dto/update-cart-item.dto";

/**
 * Every route is implicitly authenticated by the global JwtAuthGuard and
 * scoped to the calling user — there is no cart id in any path, so one
 * user can never address another user's cart.
 */
@ApiTags("cart")
@ApiBearerAuth()
@Controller("cart")
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get()
  @ApiOperation({ summary: "Get the current user's cart with live prices and totals" })
  getCart(@CurrentUser("id") userId: string) {
    return this.cart.getCart(userId);
  }

  @Post("items")
  @ApiOperation({ summary: "Add an item, merging into the existing line if already present" })
  addItem(@CurrentUser("id") userId: string, @Body() dto: AddCartItemDto) {
    return this.cart.addItem(userId, dto);
  }

  @Patch("items/:itemId")
  @ApiOperation({ summary: "Set an item's absolute quantity" })
  updateItem(
    @CurrentUser("id") userId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cart.updateItemQuantity(userId, itemId, dto.quantity);
  }

  @Delete("items/:itemId")
  @ApiOperation({ summary: "Remove an item from the cart" })
  removeItem(@CurrentUser("id") userId: string, @Param("itemId") itemId: string) {
    return this.cart.removeItem(userId, itemId);
  }

  @Delete()
  @ApiOperation({ summary: "Remove every item from the cart" })
  clear(@CurrentUser("id") userId: string) {
    return this.cart.clear(userId);
  }
}
