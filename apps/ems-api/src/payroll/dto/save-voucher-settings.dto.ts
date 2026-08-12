import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { VoucherColumn } from "../voucher-layout";
import { MAX_ROWS_PER_PAGE, MIN_ROWS_PER_PAGE } from "../voucher-settings";

export class SaveVoucherSettingsDto {
  @ApiPropertyOptional({ example: "GENERAL VOUCHER" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ example: 16, minimum: MIN_ROWS_PER_PAGE, maximum: MAX_ROWS_PER_PAGE })
  @IsOptional()
  @IsInt()
  @Min(MIN_ROWS_PER_PAGE)
  @Max(MAX_ROWS_PER_PAGE)
  rowsPerPage?: number;

  /**
   * Deliberately typed loosely here and validated in the service by
   * parseVoucherColumns/validateColumns.
   *
   * class-validator would need a nested DTO per source shape to express a
   * discriminated union, and the same parsing has to exist anyway for rows
   * already sitting in the database from an older release. One validator, in
   * one place, is better than two that can disagree.
   */
  @ApiProperty({
    description: "Ordered columns. Order is the layout.",
    example: [
      { key: "sn", label: "S/N", source: { kind: "SERIAL" } },
      { key: "name", label: "Name", source: { kind: "STAFF", field: "name" } },
      { key: "net", label: "Net Salary", source: { kind: "TOTAL", of: "NET" }, money: true },
    ],
  })
  @IsArray()
  columns!: VoucherColumn[];
}
