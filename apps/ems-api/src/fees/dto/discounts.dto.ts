import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

const KINDS = ["PERCENT", "FIXED"] as const;

export class GrantDiscountDto {
  @ApiProperty({ example: "Sibling discount" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label!: string;

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @ApiProperty({ description: "Percentage points for PERCENT, minor units for FIXED", example: 10 })
  @IsInt()
  @Min(1)
  value!: number;

  @ApiPropertyOptional({ description: "Why. Shown on the invoice and in the audit log." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class AwardScholarshipDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiProperty({ example: "Founder's Scholarship" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: "Al-Madina Foundation" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  sponsor?: string;

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  value!: number;

  @ApiPropertyOptional({ example: "2026-09-01" })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ description: "Omit for an award that runs until it is withdrawn" })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}

export class WithdrawScholarshipDto {
  @ApiProperty({ description: "Recorded against the award, which is kept rather than deleted." })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;
}
