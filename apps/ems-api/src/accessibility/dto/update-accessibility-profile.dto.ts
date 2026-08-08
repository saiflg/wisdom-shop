import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { ReadingSupport } from "ems-tenant-client";

export class UpdateAccessibilityProfileDto {
  @ApiPropertyOptional({ description: "Larger text across the whole portal" })
  @IsOptional()
  @IsBoolean()
  largeText?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  highContrast?: boolean;

  @ApiPropertyOptional({ description: "A typeface with more distinguishable letterforms" })
  @IsOptional()
  @IsBoolean()
  dyslexiaFont?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  reduceMotion?: boolean;

  @ApiPropertyOptional({ enum: ["NONE", "SIMPLIFIED", "STEP_BY_STEP"] })
  @IsOptional()
  @IsIn(["NONE", "SIMPLIFIED", "STEP_BY_STEP"])
  readingSupport?: ReadingSupport;

  @ApiPropertyOptional({ description: "Describe every diagram in words as well as drawing it" })
  @IsOptional()
  @IsBoolean()
  describeVisuals?: boolean;

  @ApiPropertyOptional({ description: "Only offer demonstrations known to be captioned" })
  @IsOptional()
  @IsBoolean()
  requireCaptions?: boolean;

  @ApiPropertyOptional({
    description:
      "Staff-only. Ignored on the student's own route, never returned to a student or guardian, and never " +
      "sent to the AI provider.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
