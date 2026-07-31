import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateOrderDto {
  @ApiPropertyOptional({
    description:
      "Required when the cart contains physical items. Must be one of the caller's own addresses.",
  })
  @IsOptional()
  @IsString()
  addressId?: string;

  @ApiPropertyOptional({
    description:
      "The total the customer was shown, in minor units. If prices changed since then the request is rejected with 409 and the new total, rather than silently charging a different amount.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  expectedTotalCents?: number;

  @ApiPropertyOptional({ description: "Coupon code to apply; matched case-insensitively" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  couponCode?: string;
}
