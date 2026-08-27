import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export class ResultTemplateComponentDto {
  @ApiProperty({ example: "CA1" })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  /**
   * Hundredths, matching Assessment.maxScoreHundredths — a 10-mark CA is
   * 1000. Kept in the same unit as the thing it creates so nobody has to
   * remember which of two screens multiplies by a hundred.
   */
  @ApiProperty({ example: 1000, description: "Hundredths: a 10-mark test is 1000" })
  @IsInt()
  @Min(1)
  maxScoreHundredths!: number;

  @ApiProperty({ example: 10, description: "Whole percent; the set must sum to 100" })
  @IsInt()
  @Min(1)
  weightPercent!: number;
}

export class CreateResultTemplateDto {
  @ApiProperty({ example: "Junior CA and Exam" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ type: [ResultTemplateComponentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => ResultTemplateComponentDto)
  components!: ResultTemplateComponentDto[];
}
