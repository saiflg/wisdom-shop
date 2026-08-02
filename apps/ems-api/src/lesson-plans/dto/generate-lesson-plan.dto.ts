import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, Min } from "class-validator";

export class GenerateLessonPlanDto {
  @ApiProperty()
  @IsString()
  schemeOfWorkId!: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  weekNumber!: number;
}
