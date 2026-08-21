import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import { FEE_PROVIDERS, type FeeProvider } from "../fee-checkout";

export class StartCheckoutDto {
  /**
   * Which gateway to pay through.
   *
   * Optional so the existing single-gateway behaviour keeps working
   * unchanged: a school with one provider switched on needs no chooser, and
   * a client that has not been updated must not break.
   */
  @ApiPropertyOptional({ enum: FEE_PROVIDERS, description: "Omit to use the school's only gateway." })
  @IsOptional()
  @IsIn(FEE_PROVIDERS)
  provider?: FeeProvider;
}
