import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsISO8601, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { LEAVE_TYPES } from "../leave";

export class RequestLeaveDto {
  @ApiPropertyOptional({ description: "Omit to ask for yourself. An administrator may name somebody else." })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiProperty({ enum: LEAVE_TYPES as unknown as string[] })
  @IsIn(LEAVE_TYPES as unknown as string[])
  type!: string;

  @ApiProperty({ example: "2027-03-01", description: "First day away, inclusive" })
  @IsISO8601()
  fromDate!: string;

  @ApiProperty({ example: "2027-03-05", description: "Last day away, inclusive" })
  @IsISO8601()
  toDate!: string;

  @ApiPropertyOptional({ description: "Required for unpaid leave." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}

export class DecideLeaveDto {
  @ApiProperty({ description: "True to approve, false to decline." })
  @IsBoolean()
  approve!: boolean;

  @ApiPropertyOptional({ description: "Shown to the person who asked." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class SetEntitlementDto {
  @ApiProperty({ example: 20, description: "Working days a year. Zero means the school is not tracking it." })
  @IsInt()
  @Min(0)
  days!: number;
}
