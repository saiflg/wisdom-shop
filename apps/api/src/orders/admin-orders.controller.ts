import { Body, Controller, Get, Param, Patch, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AdminOrdersService } from "./admin-orders.service";
import { QueryAdminOrdersDto, UpdateOrderStatusDto, UpdateShipmentDto } from "./dto/admin-order.dto";

@ApiTags("admin/orders")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN", "MANAGER", "SUPPORT")
@Controller("admin/orders")
export class AdminOrdersController {
  constructor(private readonly adminOrders: AdminOrdersService) {}

  @Get()
  @ApiOperation({ summary: "List every order, filterable by status, date range, order number or customer email" })
  list(@Query() query: QueryAdminOrdersDto) {
    return this.adminOrders.list(query);
  }

  @Get(":orderNumber")
  @ApiOperation({ summary: "Full order detail including payments and status history" })
  findOne(@Param("orderNumber") orderNumber: string) {
    return this.adminOrders.findByOrderNumber(orderNumber);
  }

  @Patch(":orderNumber/status")
  // SUPPORT can read orders but must not move money-adjacent state.
  @Roles("ADMIN", "SUPER_ADMIN", "MANAGER")
  @ApiOperation({
    summary: "Move an order to a new status",
    description:
      "Enforces the shared transition table (409 on an illegal move). Cancelling returns the order's items to stock exactly once.",
  })
  updateStatus(
    @Param("orderNumber") orderNumber: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentUser("id") actorUserId: string,
  ) {
    return this.adminOrders.updateStatus(orderNumber, dto.status, actorUserId, dto.note);
  }

  @Patch(":orderNumber/shipment")
  @Roles("ADMIN", "SUPER_ADMIN", "MANAGER")
  @ApiOperation({ summary: "Record carrier and tracking number for a paid order" })
  updateShipment(
    @Param("orderNumber") orderNumber: string,
    @Body() dto: UpdateShipmentDto,
    @CurrentUser("id") actorUserId: string,
  ) {
    return this.adminOrders.updateShipment(orderNumber, dto.carrier, dto.trackingNumber, actorUserId);
  }
}
