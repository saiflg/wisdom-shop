import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, Min } from "class-validator";
import type { TutorSessionMode } from "ems-tenant-client";

export class StartSessionDto {
  @ApiPropertyOptional({
    enum: ["ASK", "AUTO"],
    description:
      "ASK: the student asks, the tutor answers. AUTO: a course is planned and taught a lesson at a time, " +
      "pausable and resumable.",
  })
  @IsOptional()
  @IsIn(["ASK", "AUTO"])
  mode?: TutorSessionMode;

  @ApiProperty({ description: "Which subject this lesson is in" })
  @IsString()
  @MinLength(1)
  subjectId!: string;

  @ApiProperty({ description: "What the student wants to learn, in their own words" })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  topic!: string;

  @ApiPropertyOptional({
    description:
      "Anchor the lesson to one week of a scheme of work, so that week's objectives shape the teaching",
  })
  @IsOptional()
  @IsString()
  schemeOfWorkId?: string;

  @ApiPropertyOptional({ description: "Which week of that scheme of work" })
  @IsOptional()
  @IsInt()
  @Min(1)
  weekNumber?: number;
}
