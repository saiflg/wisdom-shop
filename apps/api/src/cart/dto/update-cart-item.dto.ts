import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, Max, Min } from "class-validator";
import { MAX_ITEM_QUANTITY } from "./add-cart-item.dto";

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: MAX_ITEM_QUANTITY, description: "Absolute quantity; use DELETE to remove" })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_ITEM_QUANTITY)
  quantity!: number;
}
