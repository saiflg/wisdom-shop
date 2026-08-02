import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsString, MaxLength, Min, MinLength, ValidateNested } from "class-validator";
import { QuizContentDto } from "./quiz-content.dto";

export class CreateQuizDto {
  @ApiProperty()
  @IsString()
  schemeOfWorkId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  weekNumber!: number;

  @ApiProperty({ example: "Week 1 quiz" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ type: QuizContentDto })
  @ValidateNested()
  @Type(() => QuizContentDto)
  content!: QuizContentDto;
}
