import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { SchemeOfWorkContentDto } from "./scheme-of-work-content.dto";

export class CreateSchemeOfWorkDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  academicYear!: string;

  @ApiProperty({ example: "Term 1" })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  term!: string;

  @ApiProperty({ type: SchemeOfWorkContentDto })
  @ValidateNested()
  @Type(() => SchemeOfWorkContentDto)
  content!: SchemeOfWorkContentDto;
}
