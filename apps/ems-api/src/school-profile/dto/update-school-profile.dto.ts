import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

/**
 * Every field optional, and every one nullable.
 *
 * Clearing a field has to be possible: a school that moves and no longer has
 * a second address line must be able to empty it, not just overwrite it with
 * a space.
 */
export class UpdateSchoolProfileDto {
  @ApiPropertyOptional({ example: "Learning with purpose" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  motto?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine1?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine2?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  town?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  phone?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string | null;

  @ApiPropertyOptional({ description: "Government approval number; printed on transcripts" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  registrationNumber?: string | null;

  @ApiPropertyOptional({ example: 1998 })
  @IsOptional()
  @IsInt()
  @Min(1800)
  @Max(2200)
  establishedYear?: number | null;

  @ApiPropertyOptional({ description: "Who signs a report card" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  headTeacherName?: string | null;
}
