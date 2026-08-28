import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from "class-validator";

export class StopDto {
  @ApiProperty({ example: "Maryland" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: "Where in the run this comes; defaults to the order sent" })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  /** Minutes from midnight. Null means the school has not said, not midnight. */
  @ApiPropertyOptional({ example: 390, description: "Minutes from midnight; 390 is 06:30" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1439)
  pickupMinute?: number;
}

export class UpsertStopsDto {
  @ApiProperty({ type: [StopDto], description: "The whole run; sending it replaces every stop" })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => StopDto)
  stops!: StopDto[];
}
