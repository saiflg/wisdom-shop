import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class RatingDto {
  @ApiPropertyOptional({ example: "Planning" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  area!: string;

  @ApiPropertyOptional({ example: 4, description: "1 to 5" })
  @IsInt()
  @Min(1)
  @Max(5)
  score!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}

/**
 * Everything optional, including the ratings.
 *
 * Omitting ratings leaves them alone; sending them replaces the whole set,
 * because they are read together as one picture and a half-applied edit would
 * be an appraisal nobody wrote.
 */
export class UpdateAppraisalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  periodLabel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  strengths?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  development?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ type: [RatingDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => RatingDto)
  ratings?: RatingDto[];
}
