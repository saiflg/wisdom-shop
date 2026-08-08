import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";
import { MAX_QUESTION_LENGTH } from "../tutor-limits";

export class AskQuestionDto {
  @ApiProperty({ maxLength: MAX_QUESTION_LENGTH })
  @IsString()
  @MinLength(1)
  // Bounded here as well as by the turn caps: the caps limit how many
  // questions are billed, this limits how large any one of them can be.
  @MaxLength(MAX_QUESTION_LENGTH)
  question!: string;
}
