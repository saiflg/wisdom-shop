import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export const QUIZ_QUESTION_TYPES = ["MULTIPLE_CHOICE", "SHORT_ANSWER"] as const;

export class QuizQuestionDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  questionNumber!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  prompt!: string;

  @ApiProperty({ enum: QUIZ_QUESTION_TYPES })
  @IsIn(QUIZ_QUESTION_TYPES)
  type!: (typeof QUIZ_QUESTION_TYPES)[number];

  /// Empty for SHORT_ANSWER questions; the choices for MULTIPLE_CHOICE.
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  options!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  correctAnswer!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  marks!: number;
}

/** Shape shared by hand-written and AI-generated quizzes — see Quiz.content in schema.prisma. */
export class QuizContentDto {
  @ApiProperty({ type: [QuizQuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuizQuestionDto)
  questions!: QuizQuestionDto[];
}
