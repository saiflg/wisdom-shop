import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsInt, IsString, Min, MinLength, ValidateNested } from "class-validator";

export class SchemeOfWorkWeekDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  weekNumber!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  topic!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  objectives!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  activities!: string[];
}

/** Shape shared by hand-written and AI-generated content — see SchemeOfWork.content in schema.prisma. */
export class SchemeOfWorkContentDto {
  @ApiProperty({ type: [SchemeOfWorkWeekDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SchemeOfWorkWeekDto)
  weeks!: SchemeOfWorkWeekDto[];
}
