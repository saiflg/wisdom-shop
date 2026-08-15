import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { ABSENCE_REASONS } from "../absence-notes";

export class CreateAbsenceNoteDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiProperty({ example: "2026-08-17", description: "First day away, inclusive" })
  @IsDateString()
  fromDate!: string;

  @ApiProperty({ example: "2026-08-19", description: "Last day away, inclusive. Same as fromDate for one day." })
  @IsDateString()
  toDate!: string;

  @ApiProperty({ enum: ABSENCE_REASONS as unknown as string[] })
  @IsIn(ABSENCE_REASONS as unknown as string[])
  reason!: string;

  @ApiPropertyOptional({
    description: "Required only for OTHER. Health information — staff and the author only.",
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}
