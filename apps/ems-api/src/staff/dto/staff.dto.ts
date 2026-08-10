import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsIn, IsISO8601, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { STRONG_PASSWORD_REGEX } from "@/schools/strong-password.regex";

export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "CONTRACT", "VOLUNTEER"] as const;

/**
 * The roles a staff registration may hand out.
 *
 * Not the full RoleName enum on purpose. STUDENT and GUARDIAN accounts carry a
 * family relationship and an enrollment behind them; one created here would
 * have a login and none of that, which is a broken record rather than a
 * shortcut.
 */
export const STAFF_ROLES = ["TEACHER", "SCHOOL_ADMIN"] as const;

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

/**
 * Registering a staff member: a login plus, optionally, the employment record
 * that goes with it.
 *
 * Bank details are deliberately absent. They belong on the staff record
 * screen, where the masking and the audited reveal are visible next to the
 * field — entering an account number as one box among ten on a sign-up form
 * teaches that it is ordinary, and it is not.
 */
export class RegisterStaffDto {
  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ description: "Min 10 chars, upper/lower/number/symbol" })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, {
    message: "password must include an uppercase letter, lowercase letter, number, and symbol",
  })
  password!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({
    enum: STAFF_ROLES,
    description: "SCHOOL_ADMIN grants administrator access to the whole school — every screen in this module included.",
  })
  @IsIn(STAFF_ROLES)
  role!: (typeof STAFF_ROLES)[number];

  @ApiPropertyOptional({ example: "STF-014" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  staffNumber?: string;

  @ApiPropertyOptional({ example: "Bursar" })
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
