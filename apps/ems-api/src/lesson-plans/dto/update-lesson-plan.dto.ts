import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { LessonPlanContentDto } from "./lesson-plan-content.dto";

export class UpdateLessonPlanDto {
  @ApiProperty({ type: LessonPlanContentDto })
  @ValidateNested()
  @Type(() => LessonPlanContentDto)
  content!: LessonPlanContentDto;
}
