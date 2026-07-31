import { Body, Controller, Delete, Get, Global, HttpCode, HttpStatus, Module, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CouponsService } from "./coupons.service";

class PreviewCouponDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @ApiProperty({ description: "Pre-discount subtotal in minor units" })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  subtotalCents!: number;
}

class CreateCouponDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  code!: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountOffCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minSubtotalCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ description: "ISO 8601" })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

class UpdateCouponDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @ApiPropertyOptional({ description: "ISO 8601" })
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

@ApiTags("coupons")
@ApiBearerAuth()
@Controller("coupons")
export class CouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Post("preview")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Check a coupon against a subtotal without consuming it",
    description:
      "Always 200 — an invalid code is reported in the body rather than as an error, so the cart can show the reason inline.",
  })
  preview(@Body() dto: PreviewCouponDto) {
    return this.coupons.preview(dto.code, dto.subtotalCents);
  }
}

@ApiTags("admin/coupons")
@ApiBearerAuth()
@Roles("ADMIN", "SUPER_ADMIN", "MANAGER")
@Controller("admin/coupons")
export class AdminCouponsController {
  constructor(private readonly coupons: CouponsService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  @Post()
  @ApiOperation({ summary: "Create a coupon (exactly one of percentOff / amountOffCents)" })
  create(@Body() dto: CreateCouponDto, @CurrentUser("id") actorUserId: string) {
    return this.coupons.create(dto, actorUserId);
  }

  @Patch(":id")
  @ApiOperation({
    summary: "Deactivate, extend, or change the redemption cap",
    description:
      "The discount itself is not editable: a code already in circulation changing value underneath customers is a support problem. Deactivate it and issue a new one.",
  })
  update(
    @Param("id") id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser("id") actorUserId: string,
  ) {
    return this.coupons.update(id, dto, actorUserId);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete an unused coupon; 409 once it is on an order" })
  remove(@Param("id") id: string, @CurrentUser("id") actorUserId: string) {
    return this.coupons.remove(id, actorUserId);
  }
}

/** Global so the orders module can redeem inside its checkout transaction. */
@Global()
@Module({
  controllers: [CouponsController, AdminCouponsController],
  providers: [CouponsService],
  exports: [CouponsService],
})
export class CouponsModule {}
