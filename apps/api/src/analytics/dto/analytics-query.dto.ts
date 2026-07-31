import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, Max, Min } from "class-validator";

/**
 * Both parameters are bounded on purpose. `ParseIntPipe` alone would happily
 * accept `?limit=100000` or a negative `?days`, handing any staff account an
 * unbounded aggregate over the orders table.
 */
export class SummaryQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 366, default: 30 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(366)
  days?: number = 30;
}

export class TopProductsQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 5;
}
