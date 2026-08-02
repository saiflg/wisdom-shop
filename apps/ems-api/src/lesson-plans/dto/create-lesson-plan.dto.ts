import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsString, Min, ValidateNested } from "class-validator";
import { LessonPlanContentDto } from "./lesson-plan-content.dto";

export class CreateLessonPlanDto {
  @ApiProperty()
  @IsString()
  schemeOfWorkId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  weekNumber!: number;

  @ApiProperty({ type: LessonPlanContentDto })
  @ValidateNested()
  @Type(() => LessonPlanContentDto)
  content!: LessonPlanContentDto;
}
