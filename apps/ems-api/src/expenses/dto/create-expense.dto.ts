import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateExpenseDto {
  @ApiProperty({ example: "Diesel" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  @ApiProperty({ example: "Generator diesel for September" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  description!: string;

  @ApiProperty({ example: 5000000, description: "Minor units, always positive" })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ example: "2026-09-07", description: "When it was spent, not when it was typed up" })
  @IsDateString()
  incurredOn!: string;

  @ApiPropertyOptional({ example: "Ikeja Fuels Ltd" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  payee?: string;
}
