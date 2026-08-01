import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateClassDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  gradeLevel?: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  academicYear!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeroomTeacherId?: string;
}
