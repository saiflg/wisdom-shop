import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateLiveLessonDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subjectId?: string;

  @ApiProperty({ example: "Fractions revision" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiProperty({
    example: "https://meet.google.com/abc-defg-hij",
    description: "https, from an allowed meeting host",
  })
  @IsString()
  @MaxLength(500)
  meetingUrl!: string;

  @ApiProperty()
  @IsDateString()
  startsAt!: string;

  @ApiProperty()
  @IsDateString()
  endsAt!: string;
}
