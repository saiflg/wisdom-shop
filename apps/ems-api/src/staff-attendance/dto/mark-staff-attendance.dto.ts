import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const STATUSES = ["PRESENT", "ABSENT", "LATE", "ON_LEAVE"] as const;

export class MarkStaffAttendanceDto {
  @ApiProperty()
  @IsString()
  userId!: string;

  @ApiProperty({ example: "2026-09-07", description: "Date only; the time of day is ignored" })
  @IsDateString()
  date!: string;

  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  status!: (typeof STATUSES)[number];

  /** Only on a LATE mark. Refused on any other — see staff-attendance-rules. */
  @ApiPropertyOptional({ example: 25 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(600)
  minutesLate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}
