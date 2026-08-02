import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsString, MinLength } from "class-validator";

/** Shape shared by hand-written and AI-generated content — see LessonPlan.content in schema.prisma. */
export class LessonPlanContentDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  objectives!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  materials!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  introduction!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  developmentSteps!: string[];

  @ApiProperty()
  @IsString()
  @MinLength(1)
  conclusion!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  assessment!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  homework!: string;
}
