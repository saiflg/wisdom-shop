import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

/**
 * Only the note itself.
 *
 * Which class, subject and week it belongs to are not editable: changing them
 * is not an amendment, it is a different note, and it would slip past the
 * one-note-per-week index by moving into a week that already has one.
 */
export class UpdateLessonNoteDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50000)
  body?: string;
}
