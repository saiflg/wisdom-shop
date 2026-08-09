import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import type { ExamStatus, QuestionType } from "ems-tenant-client";

export const QUESTION_TYPES = [
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "ESSAY",
] as const;

export class QuestionOptionDto {
  @ApiProperty({ example: "A" })
  @IsString()
  @MinLength(1)
  @MaxLength(8)
  key!: string;

  @ApiProperty({ example: "4" })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  text!: string;
}

export class CreateQuestionDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiPropertyOptional({ example: "Grade 5" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gradeLevel?: string;

  @ApiPropertyOptional({ example: "Fractions" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @ApiProperty({ enum: QUESTION_TYPES })
  @IsIn(QUESTION_TYPES)
  type!: QuestionType;

  @ApiProperty({ example: "What is one half of eight?" })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  prompt!: string;

  @ApiPropertyOptional({ type: [QuestionOptionDto], description: "Choice types only." })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @ApiPropertyOptional({
    type: [String],
    description:
      "Choice types: the correct option keys. Short answer: every accepted spelling. " +
      "Essay: omit — there is no key, and one would only invite auto-marking.",
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  answer?: string[];

  @ApiPropertyOptional({ description: "Hundredths of a mark. 200 is 2 marks.", default: 100 })
  @IsOptional()
  @IsInt()
  @Min(1)
  marksHundredths?: number;
}

export class UpdateQuestionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  topic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  prompt?: string;

  @ApiPropertyOptional({ type: [QuestionOptionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => QuestionOptionDto)
  options?: QuestionOptionDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  answer?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  marksHundredths?: number;
}

export class CreateExamDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty({ example: "End of term test" })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional({ example: "Answer every question. Calculators are not allowed." })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MaxLength(50)
  academicYear!: string;

  @ApiProperty({ example: "Term 1" })
  @IsString()
  @MaxLength(50)
  term!: string;

  @ApiProperty({ description: "Minutes each student gets once they start.", example: 45 })
  @IsInt()
  @Min(1)
  durationMinutes!: number;

  @ApiPropertyOptional({ description: "Earliest a student may start. Omit for no bound." })
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional({ description: "Latest a student may start, and a hard stop on every clock." })
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ApiPropertyOptional({
    description: "Count this towards an assessment, so a released mark reaches the report card.",
  })
  @IsOptional()
  @IsString()
  assessmentId?: string;
}

export class UpdateExamDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  instructions?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMinutes?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  opensAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  closesAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shuffleQuestions?: boolean;

  @ApiPropertyOptional({ enum: ["DRAFT", "PUBLISHED", "CLOSED"] })
  @IsOptional()
  @IsIn(["DRAFT", "PUBLISHED", "CLOSED"])
  status?: ExamStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assessmentId?: string;
}

export class AddExamQuestionsDto {
  @ApiProperty({
    type: [String],
    description: "Question bank item ids, in the order they should appear on the paper.",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  questionIds!: string[];
}

export class SaveAnswerDto {
  @ApiProperty({ description: "The exam question being answered." })
  @IsString()
  examQuestionId!: string;

  @ApiProperty({
    type: [String],
    description: "Chosen option keys, or a single string for a written answer.",
  })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(20000, { each: true })
  response!: string[];
}

export class MarkExamAnswerDto {
  @ApiProperty({ description: "Hundredths of a mark, no more than the question is worth." })
  @IsInt()
  @Min(0)
  awardedHundredths!: number;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  feedback?: string;
}

export class GenerateQuestionsDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty({ example: "Fractions" })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  topic!: string;

  @ApiPropertyOptional({ example: "Grade 5" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  gradeLevel?: string;

  @ApiPropertyOptional({ description: "How many to generate.", default: 5, maximum: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  count?: number;
}
