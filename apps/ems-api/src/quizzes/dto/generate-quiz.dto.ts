import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class GenerateQuizDto {
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

  @ApiPropertyOptional({ default: 5, description: "How many questions to generate" })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  questionCount?: number;
}
