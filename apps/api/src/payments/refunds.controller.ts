import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RefundsService } from "./refunds.service";
import { CreateRefundDto } from "./dto/refund.dto";

@ApiTags("admin/refunds")
@ApiBearerAuth()
@Controller("admin/orders/:orderNumber/refunds")
export class RefundsController {
  constructor(private readonly refunds: RefundsService) {}

  // SUPPORT and MANAGER can see the refund position when a customer asks.
  @Get()
  @Roles("ADMIN", "SUPER_ADMIN", "MANAGER", "SUPPORT")
  @ApiOperation({ summary: "Refund history and remaining refundable balance for an order" })
  summary(@Param("orderNumber") orderNumber: string) {
    return this.refunds.summary(orderNumber);
  }

  /**
   * Deliberately narrower than the rest of admin orders: this sends money
   * out of the merchant account, so SUPPORT and MANAGER are excluded even
   * though they can move an order's status. Vendors are excluded entirely —
   * the funds are not in their account to return.
   */
  @Post()
  @Roles("ADMIN", "SUPER_ADMIN")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: "Issue a refund against an order",
    description:
      "Calls the original payment provider. Refuses to refund more than remains, and a repeated idempotencyKey returns the original refund rather than sending the money twice. Responds 409 if the provider declines — the attempt is still recorded.",
  })
  create(
    @Param("orderNumber") orderNumber: string,
    @Body() dto: CreateRefundDto,
    @CurrentUser("id") actorUserId: string,
  ) {
    return this.refunds.refundOrder(orderNumber, dto, actorUserId);
  }
}
