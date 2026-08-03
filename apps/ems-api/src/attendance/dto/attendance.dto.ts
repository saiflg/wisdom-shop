import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from "class-validator";

export const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;

export class AttendanceMarkDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiProperty({ enum: ATTENDANCE_STATUSES })
  @IsIn(ATTENDANCE_STATUSES)
  status!: (typeof ATTENDANCE_STATUSES)[number];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export class TakeRegisterDto {
  @ApiProperty()
  @IsString()
  classId!: string;

  @ApiProperty({ example: "2026-08-03", description: "Date only; time is ignored" })
  @IsISO8601()
  date!: string;

  @ApiPropertyOptional({ description: "Period label for schools marking more than once a day" })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  session?: string;

  @ApiProperty({ type: [AttendanceMarkDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AttendanceMarkDto)
  marks!: AttendanceMarkDto[];
}

export class AmendAttendanceDto {
  @ApiProperty({ enum: ATTENDANCE_STATUSES })
  @IsIn(ATTENDANCE_STATUSES)
  status!: (typeof ATTENDANCE_STATUSES)[number];

  /**
   * Required, not optional. An attendance mark is used to justify
   * decisions about a child, so a correction has to say why — an
   * unexplained change is indistinguishable from tampering.
   */
  @ApiProperty({ example: "Parent confirmed medical appointment" })
  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
