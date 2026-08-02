import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { CurriculumMode } from "ems-tenant-client";

export class UpdateCurriculumSettingsDto {
  @ApiPropertyOptional({ enum: CurriculumMode })
  @IsOptional()
  @IsEnum(CurriculumMode)
  mode?: CurriculumMode;

  @ApiPropertyOptional({ example: "Nigeria" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  curriculumStandard?: string;
}
