import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export const WEEKDAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export class PeriodDto {
  @ApiPropertyOptional({ description: "Omit to create; supply to keep an existing period and its lessons" })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: "Period 1" })
  @IsString()
  @MaxLength(60)
  label!: string;

  @ApiProperty({ example: 510, description: "Minutes since midnight — 510 is 08:30" })
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinute!: number;

  @ApiProperty({ example: 550, description: "Minutes since midnight — must be after the start" })
  @IsInt()
  @Min(0)
  @Max(1440)
  endMinute!: number;

  @ApiPropertyOptional({ description: "False for break and lunch, which hold no lesson" })
  @IsOptional()
  @IsBoolean()
  isTeaching?: boolean;
}

export class ReplacePeriodsDto {
  @ApiProperty({ type: [PeriodDto], description: "The whole day, in one call. Periods must not overlap." })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodDto)
  periods!: PeriodDto[];
}

export class UpsertEntryDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiPropertyOptional({ description: "Omit to leave the lesson unstaffed for now" })
  @IsOptional()
  @IsString()
  teacherUserId?: string;

  @ApiProperty({ enum: WEEKDAYS })
  @IsIn(WEEKDAYS)
  weekday!: (typeof WEEKDAYS)[number];

  @ApiProperty()
  @IsString()
  periodId!: string;

  @ApiPropertyOptional({ example: "Lab 2" })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  room?: string;
}

export class TimetableSettingsDto {
  @ApiProperty({ example: 480, description: "Minutes since midnight — 480 is 08:00" })
  @IsInt()
  @Min(0)
  @Max(1440)
  dayStartMinute!: number;

  @ApiProperty({ example: 840, description: "840 is 14:00" })
  @IsInt()
  @Min(0)
  @Max(1440)
  dayEndMinute!: number;

  @ApiProperty({ example: 8, description: "Teaching periods, not counting the break" })
  @IsInt()
  @Min(1)
  @Max(20)
  periodsPerDay!: number;

  @ApiPropertyOptional({ example: 4, description: "Break after this many periods. Omit for no break." })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  breakAfterPeriod?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(240)
  breakLengthMinutes?: number;

  @ApiPropertyOptional({
    description: "Rebuild the period structure from these settings. Lessons already scheduled are cleared.",
  })
  @IsOptional()
  @IsBoolean()
  applyToPeriods?: boolean;
}

export class UpsertAssignmentDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty()
  @IsString()
  subjectId!: string;

  @ApiPropertyOptional({ description: "Omit while the school does not yet know who will teach it" })
  @IsOptional()
  @IsString()
  teacherUserId?: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(1)
  @Max(40)
  periodsPerWeek!: number;
}

export class GenerateTimetableDto {
  @ApiPropertyOptional({
    description:
      "Preview only. Defaults to true — nothing is written unless this is explicitly false, because " +
      "generating replaces the whole week.",
  })
  @IsOptional()
  @IsBoolean()
  commit?: boolean;
}

export class BulkEntriesDto {
  @ApiProperty({ type: [UpsertEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpsertEntryDto)
  entries!: UpsertEntryDto[];
}
