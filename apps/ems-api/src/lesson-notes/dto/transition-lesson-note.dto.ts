import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "RETURNED"] as const;

export class TransitionLessonNoteDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  to!: (typeof STATUSES)[number];

  /** Required when sending a note back — see the service. */
  @ApiPropertyOptional({ example: "Week 3 objectives are missing." })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
