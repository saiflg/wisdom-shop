import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class DownloadVoucherDto {
  @ApiPropertyOptional({
    description:
      "Print full account numbers instead of the last four digits. Every staff member whose number is disclosed is recorded in the bank-detail access log.",
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  includeAccountNumbers?: boolean;

  @ApiPropertyOptional({
    description: "Rows between subtotals — a property of the paper the school prints on.",
    default: 16,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  // Capped so a typo cannot ask for a subtotal every million rows and produce
  // a voucher with no usable page totals at all.
  @Max(500)
  rowsPerPage?: number;
}
