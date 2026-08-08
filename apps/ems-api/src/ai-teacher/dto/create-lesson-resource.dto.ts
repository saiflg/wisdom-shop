import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import type { LessonResourceKind } from "ems-tenant-client";

export class CreateLessonResourceDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  subjectId!: string;

  @ApiProperty({ example: "Adding fractions — worked example" })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    description: "http(s) only. Validated again on the way out — a stored link is still a link a child will follow.",
  })
  @IsString()
  @MaxLength(2000)
  url!: string;

  @ApiPropertyOptional({ enum: ["VIDEO", "DOCUMENT", "LINK"] })
  @IsOptional()
  @IsIn(["VIDEO", "DOCUMENT", "LINK"])
  kind?: LessonResourceKind;

  @ApiPropertyOptional({
    description: "Words to match against lesson titles, so one demonstration can serve several lessons",
    example: "fractions denominators halves",
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  keywords?: string;
}
