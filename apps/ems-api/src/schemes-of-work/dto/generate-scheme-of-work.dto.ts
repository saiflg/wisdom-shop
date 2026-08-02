import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class GenerateSchemeOfWorkDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  academicYear!: string;

  @ApiProperty({ example: "Term 1" })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  term!: string;

  @ApiPropertyOptional({ default: 12, description: "How many weeks to generate" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(52)
  weekCount?: number;
}
