import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateAppraisalDto {
  @ApiProperty({ description: "Who is being appraised. Never yourself." })
  @IsString()
  subjectUserId!: string;

  @ApiProperty({ example: "2026-2027 First term" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  periodLabel!: string;

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
}
