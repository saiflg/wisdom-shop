import { Body, Controller, Get, Param, Patch, Post, Query, Delete, HttpCode, HttpStatus } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { VendorStatus } from "@prisma/client";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { VendorsService } from "./vendors.service";
import { ProductsService } from "../catalog/products/products.service";
import { ApplyVendorDto, UpdateVendorStatusDto } from "./dto/vendor.dto";
import { CreateProductDto } from "../catalog/products/dto/create-product.dto";
import { UpdateProductDto } from "../catalog/products/dto/update-product.dto";
import { QueryProductsDto } from "../catalog/products/dto/query-products.dto";

/** Applying is open to any signed-in customer. */
@ApiTags("vendors")
@ApiBearerAuth()
@Controller("vendors")
export class VendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Post("apply")
  @ApiOperation({ summary: "Apply to become a vendor; the application starts PENDING" })
  apply(@CurrentUser("id") userId: string, @Body() dto: ApplyVendorDto) {
    return this.vendors.apply(userId, dto);
  }

  @Get("me")
  @ApiOperation({ summary: "Your own vendor account and its status" })
  findMine(@CurrentUser("id") userId: string) {
    return this.vendors.findMine(userId);
  }
}

/**
 * Vendor-scoped product management.
 *
 * Holding the VENDOR role is not sufficient — every route resolves the
 * caller's *own* vendor id via `requireApprovedVendorId` and passes it into
 * the query, so a vendor can only ever see or touch their own products, and
 * a PENDING or SUSPENDED vendor is refused outright.
 */
@ApiTags("vendor/products")
@ApiBearerAuth()
@Roles("VENDOR")
@Controller("vendor/products")
export class VendorProductsController {
  constructor(
    private readonly vendors: VendorsService,
    private readonly products: ProductsService,
  ) {}

  @Get()
  async findAll(@CurrentUser("id") userId: string, @Query() query: QueryProductsDto) {
    const vendorId = await this.vendors.requireApprovedVendorId(userId);
    return this.products.findVendorList(vendorId, query);
  }

  @Get(":id")
  async findOne(@CurrentUser("id") userId: string, @Param("id") id: string) {
    const vendorId = await this.vendors.requireApprovedVendorId(userId);
    return this.products.findVendorById(vendorId, id);
  }

  @Post()
  @ApiOperation({ summary: "Create a product owned by your vendor account (starts DRAFT)" })
  async create(@CurrentUser("id") userId: string, @Body() dto: CreateProductDto) {
    const vendorId = await this.vendors.requireApprovedVendorId(userId);
    // vendorId comes from the token's own vendor record, never from the body.
    return this.products.create(dto, vendorId);
  }

  @Patch(":id")
  async update(
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ) {
    const vendorId = await this.vendors.requireApprovedVendorId(userId);
    return this.products.updateForVendor(vendorId, id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser("id") userId: string, @Param("id") id: string) {
    const vendorId = await this.vendors.requireApprovedVendorId(userId);
    return this.products.removeForVendor(vendorId, id);
  }
}

@ApiTags("vendor/earnings")
@ApiBearerAuth()
@Roles("VENDOR")
@Controller("vendor/earnings")
export class VendorEarningsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  @ApiOperation({
    summary: "Your order lines with the commission snapshotted at order time",
    description:
      "Totals count only settled orders (PAID/PROCESSING/SHIPPED/DELIVERED); pending, cancelled and refunded lines are listed but excluded.",
  })
  async earnings(@CurrentUser("id") userId: string) {
    const vendorId = await this.vendors.requireApprovedVendorId(userId);
    return this.vendors.earnings(vendorId);
  }
}

@ApiTags("admin/vendors")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN", "MANAGER")
@Controller("admin/vendors")
export class AdminVendorsController {
  constructor(private readonly vendors: VendorsService) {}

  @Get()
  list(@Query("status") status?: VendorStatus) {
    return this.vendors.listForAdmin(status);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.vendors.findForAdmin(id);
  }

  @Patch(":id/status")
  @ApiOperation({
    summary: "Approve, suspend or reject a vendor",
    description:
      "Approving grants the VENDOR role; suspending or rejecting revokes it, so role membership always tracks vendor state.",
  })
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateVendorStatusDto,
    @CurrentUser("id") actorUserId: string,
  ) {
    return this.vendors.updateStatus(id, dto.status, actorUserId, dto.commissionPct);
  }
}
