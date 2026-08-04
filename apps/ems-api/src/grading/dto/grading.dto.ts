import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export const MARK_STATUSES = ["RECORDED", "ABSENT", "EXCUSED"] as const;

export class GradeBandDto {
  @ApiProperty({ example: "A" })
  @IsString()
  @MaxLength(10)
  label!: string;

  @ApiProperty({ example: 70, description: "Inclusive lower bound, whole percent" })
  @IsInt()
  @Min(0)
  @Max(100)
  minPercent!: number;

  @ApiProperty({ example: 100, description: "Inclusive upper bound, whole percent" })
  @IsInt()
  @Min(0)
  @Max(100)
  maxPercent!: number;

  @ApiPropertyOptional({ example: "Excellent" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  remark?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  gradePoint?: number;
}

export class UpsertGradeScaleDto {
  @ApiProperty({ example: "WAEC" })
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiProperty({ type: [GradeBandDto], description: "Must tile 0–100 with no gap or overlap" })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => GradeBandDto)
  bands!: GradeBandDto[];
}

export class CreateAssessmentDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty({ example: "Continuous Assessment 1" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MaxLength(20)
  academicYear!: string;

  @ApiProperty({ example: "Term 1" })
  @IsString()
  @MaxLength(40)
  term!: string;

  @ApiProperty({ example: 2000, description: "Highest achievable score in hundredths — 2000 is 20 marks" })
  @IsInt()
  @Min(1)
  maxScoreHundredths!: number;

  @ApiProperty({ example: 40, description: "Whole percent. All assessments for a subject/term must total 100." })
  @IsInt()
  @Min(1)
  @Max(100)
  weightPercent!: number;
}

export class MarkEntryDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiPropertyOptional({ example: 1750, description: "Hundredths of a mark. Omit for ABSENT or EXCUSED." })
  @IsOptional()
  @IsInt()
  @Min(0)
  scoreHundredths?: number;

  @ApiProperty({
    enum: MARK_STATUSES,
    description: "ABSENT counts as zero; EXCUSED is excluded and the remaining weights are renormalised.",
  })
  @IsIn(MARK_STATUSES)
  status!: (typeof MARK_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  comment?: string;
}

export class RecordMarksDto {
  @ApiProperty({ type: [MarkEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  marks!: MarkEntryDto[];
}

export class PublishResultsDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MaxLength(20)
  academicYear!: string;

  @ApiProperty({ example: "Term 1" })
  @IsString()
  @MaxLength(40)
  term!: string;

  @ApiPropertyOptional({ description: "Defaults to the school's default scale" })
  @IsOptional()
  @IsString()
  gradeScaleId?: string;
}
