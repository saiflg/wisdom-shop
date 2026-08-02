import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { QuizContentDto } from "./quiz-content.dto";

export class UpdateQuizDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  title?: string;

  @ApiPropertyOptional({ type: QuizContentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => QuizContentDto)
  content?: QuizContentDto;
}
