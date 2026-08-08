import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";
import type { AssignmentStatus } from "ems-tenant-client";

export class CreateAssignmentDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty({ example: "Fractions worksheet" })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({ example: "Complete questions 1 to 12 on page 43." })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  instructions!: string;

  @ApiPropertyOptional({
    description: "When it is due. Omit for 'before next lesson' — work is then never counted late.",
  })
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ description: "Hundredths of a mark. 2000 is 20 marks.", default: 10000 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxScoreHundredths?: number;

  @ApiPropertyOptional({
    description: "Count this towards an assessment, so a released mark reaches the report card.",
  })
  @IsOptional()
  @IsString()
  assessmentId?: string;
}

export class UpdateAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueAt?: string;

  @ApiPropertyOptional({ enum: ["DRAFT", "SET", "CLOSED"] })
  @IsOptional()
  @IsIn(["DRAFT", "SET", "CLOSED"])
  status?: AssignmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  maxScoreHundredths?: number;
}

export class SubmitWorkDto {
  @ApiProperty({ description: "What the student is handing in." })
  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  content!: string;
}

export class MarkSubmissionDto {
  @ApiPropertyOptional({ description: "Hundredths of a mark. Omit to leave feedback without a score." })
  @IsOptional()
  @IsInt()
  scoreHundredths?: number;

  @ApiPropertyOptional({ maxLength: 5000 })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;

  @ApiPropertyOptional({
    description: "Release to the student straight away. Otherwise the mark is held until the class is released.",
  })
  @IsOptional()
  @IsBoolean()
  release?: boolean;
}
