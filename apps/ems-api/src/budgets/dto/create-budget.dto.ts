import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class BudgetLineDto {
  @ApiProperty({ example: "Diesel", description: "Matched to expense categories by name, ignoring case" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  /** Zero is allowed: budgeting nothing for something is a real decision. */
  @ApiProperty({ example: 10000000, description: "Minor units" })
  @IsInt()
  @Min(0)
  amountCents!: number;
}

export class CreateBudgetDto {
  @ApiProperty({ example: "2026-2027 First term" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MaxLength(20)
  academicYear!: string;

  @ApiPropertyOptional({ example: "First", description: "Omit for a whole-year budget" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  term?: string;

  @ApiProperty({ example: "2026-09-01" })
  @IsDateString()
  fromDate!: string;

  @ApiProperty({ example: "2026-12-15" })
  @IsDateString()
  toDate!: string;

  @ApiProperty({ type: [BudgetLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines!: BudgetLineDto[];
}
