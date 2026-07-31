import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { OrdersService } from "./orders.service";
import { CreateOrderDto } from "./dto/create-order.dto";

@ApiTags("orders")
@ApiBearerAuth()
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get("checkout/preview")
  @ApiOperation({ summary: "Totals for the current cart, including shipping and tax, before committing" })
  preview(@CurrentUser("id") userId: string) {
    return this.orders.preview(userId);
  }

  @Post("orders")
  @ApiOperation({
    summary: "Turn the cart into a PENDING order",
    description:
      "Snapshots prices, decrements stock atomically, and clears the cart. Returns 409 if stock ran out or if prices changed since expectedTotalCents was calculated.",
  })
  create(@CurrentUser("id") userId: string, @Body() dto: CreateOrderDto) {
    return this.orders.createFromCart(userId, dto);
  }

  @Get("orders")
  @ApiOperation({ summary: "List the current user's orders, newest first" })
  list(@CurrentUser("id") userId: string) {
    return this.orders.listForUser(userId);
  }

  @Get("orders/:orderNumber")
  @ApiOperation({ summary: "Get one of the current user's orders by its order number" })
  findOne(@CurrentUser("id") userId: string, @Param("orderNumber") orderNumber: string) {
    return this.orders.findOwned(userId, orderNumber);
  }
}
