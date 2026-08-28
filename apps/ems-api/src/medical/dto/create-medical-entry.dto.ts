import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

const KINDS = ["ALLERGY", "CONDITION", "MEDICATION", "NOTE"] as const;
const SEVERITIES = ["LIFE_THREATENING", "SIGNIFICANT", "MINOR"] as const;

export class CreateMedicalEntryDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS as unknown as string[])
  kind!: (typeof KINDS)[number];

  /** Required for an allergy or condition, refused on a note. */
  @ApiPropertyOptional({ enum: SEVERITIES })
  @IsOptional()
  @IsIn(SEVERITIES as unknown as string[])
  severity?: (typeof SEVERITIES)[number];

  @ApiProperty({ example: "Peanuts" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  detail?: string;

  @ApiPropertyOptional({ description: "What to do if it happens" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  action?: string;
}
