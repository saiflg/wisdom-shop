import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** Upper bound per line item — guards against a typo'd or hostile quantity. */
export const MAX_ITEM_QUANTITY = 999;

export class AddCartItemDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ description: "Required only for products that have variants" })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_ITEM_QUANTITY, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity?: number = 1;
}
