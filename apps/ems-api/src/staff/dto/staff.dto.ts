import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "VOLUNTEER"] as const;

export class UpsertStaffProfileDto {
  @ApiPropertyOptional({ description: "School-issued staff number — the key a re-imported spreadsheet matches on" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  staffNumber?: string;

  @ApiPropertyOptional({ example: "Head of Mathematics" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jobTitle?: string;

  @ApiPropertyOptional({ enum: EMPLOYMENT_TYPES })
  @IsOptional()
  @IsIn(EMPLOYMENT_TYPES)
  employmentType?: (typeof EMPLOYMENT_TYPES)[number];

  @ApiPropertyOptional({ example: "2026-09-01" })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiPropertyOptional({ example: "2027-08-31" })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({ example: "First Bank" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @ApiPropertyOptional({ example: "011", description: "Sort code or routing number — not secret" })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  bankCode?: string;

  @ApiPropertyOptional({ example: "Ade Balogun", description: "Required whenever an account number is supplied" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  accountName?: string;

  @ApiPropertyOptional({
    example: "0123456789",
    description: "Stored encrypted and returned masked. Send an empty string to clear it.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  accountNumber?: string;
}

export class RevealAccountNumberDto {
  @ApiProperty({
    example: "Preparing the October payroll run",
    description: "Recorded in the access log, so the log says why and not merely that.",
  })
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  reason!: string;
}
