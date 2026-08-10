import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { MODULE_KEYS, type ModuleKey } from "@/schools/school-modules";

const INTERVALS = ["MONTHLY", "YEARLY"] as const;

export class CreatePlanDto {
  @ApiProperty({ example: "growth" })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ description: "Price in minor units (kobo/cents), never a decimal" })
  @IsInt()
  @Min(0)
  priceCents!: number;

  @ApiProperty({ example: "NGN" })
  @IsString()
  @Length(3, 3)
  currency!: string;

  @ApiProperty({ enum: INTERVALS })
  @IsIn(INTERVALS)
  interval!: (typeof INTERVALS)[number];

  @ApiPropertyOptional({ description: "Omit for unlimited" })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxStudents?: number;

  @ApiPropertyOptional({ description: "Omit for unlimited" })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxStaff?: number;

  @ApiPropertyOptional({
    enum: MODULE_KEYS,
    isArray: true,
    description:
      "Modules this plan includes. Omit or leave empty and the plan takes the default set — see school-modules.ts.",
  })
  @IsOptional()
  @IsArray()
  @IsIn(MODULE_KEYS, { each: true })
  modules?: ModuleKey[];
}

export class UpdatePlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: "Only affects new subscriptions — existing ones keep their snapshotted price" })
  @IsOptional()
  @IsInt()
  @Min(0)
  priceCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: MODULE_KEYS,
    isArray: true,
    description:
      "Replaces the plan's module list. Takes effect immediately for every school on this plan, except where a school has its own override.",
  })
  @IsOptional()
  @IsArray()
  @IsIn(MODULE_KEYS, { each: true })
  modules?: ModuleKey[];
}

export class SubscribeSchoolDto {
  @ApiProperty()
  @IsString()
  planId!: string;

  @ApiPropertyOptional({ description: "Days of trial before the first paid period; omit for none" })
  @IsOptional()
  @IsInt()
  @Min(1)
  trialDays?: number;
}

export class InvoiceLineDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ description: "Minor units" })
  @IsInt()
  @Min(0)
  unitPriceCents!: number;
}

export class GenerateInvoiceDto {
  @ApiPropertyOptional({
    description: "Defaults to a single line for the school's current subscription period",
    type: [InvoiceLineDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];

  @ApiPropertyOptional({ description: "Days until due; defaults to 14" })
  @IsOptional()
  @IsInt()
  @Min(0)
  dueInDays?: number;
}
