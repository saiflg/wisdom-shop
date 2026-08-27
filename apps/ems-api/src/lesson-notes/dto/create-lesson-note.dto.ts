import { ApiProperty } from "@nestjs/swagger";
import { IsInt, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateLessonNoteDto {
  @ApiProperty()
  @IsString()
  subjectId!: string;

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

  @ApiProperty({ example: 3 })
  @IsInt()
  @Min(1)
  @Max(52)
  weekNumber!: number;

  @ApiProperty({ example: "Adding fractions with different denominators" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  /** The note itself. Long, because it is what a class copies down. */
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  body!: string;
}
