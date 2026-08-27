import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsString, MaxLength, MinLength } from "class-validator";

export class ApplyResultTemplateDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  academicYear!: string;

  @ApiProperty({ example: "First" })
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  term!: string;

  @ApiProperty({ type: [String], description: "Subjects to create this shape for" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsString({ each: true })
  subjectIds!: string[];
}
