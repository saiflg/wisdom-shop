import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import type { PayComponentBasis, PayComponentKind } from "ems-tenant-client";

export class SalaryComponentDto {
  @ApiProperty({ example: "Basic" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @ApiProperty({ enum: ["EARNING", "DEDUCTION"] })
  @IsIn(["EARNING", "DEDUCTION"])
  kind!: PayComponentKind;

  @ApiPropertyOptional({ enum: ["FIXED", "PERCENT_OF_BASIC"], default: "FIXED" })
  @IsOptional()
  @IsIn(["FIXED", "PERCENT_OF_BASIC"])
  basis?: PayComponentBasis;

  @ApiProperty({
    description:
      "Minor units (kobo/cents) when FIXED, hundredths of a percent when PERCENT_OF_BASIC — 12.5% is 1250. " +
      "Integers throughout: a salary is not a place for floating point.",
  })
  @IsInt()
  @Min(0)
  amount!: number;

  @ApiPropertyOptional({
    description: "Marks the component percentages are taken from. At most one, and it must be a fixed earning.",
  })
  @IsOptional()
  @IsBoolean()
  isBasic?: boolean;
}

export class SetSalaryComponentsDto {
  @ApiProperty({ type: [SalaryComponentDto] })
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SalaryComponentDto)
  components!: SalaryComponentDto[];
}
