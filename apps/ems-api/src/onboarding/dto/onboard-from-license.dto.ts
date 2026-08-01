import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { STRONG_PASSWORD_REGEX } from "@/schools/strong-password.regex";

export class OnboardFromLicenseDto {
  @ApiProperty({ description: "The short-lived token minted by the shop's setup-handoff endpoint" })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  schoolName!: string;

  @ApiProperty({ description: "Lowercase letters, digits, hyphens; 3-32 chars" })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, {
    message: "schoolSlug must be lowercase letters, digits and hyphens only (3-32 chars)",
  })
  schoolSlug!: string;

  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  adminEmail!: string;

  @ApiProperty({ description: "Min 10 chars, upper/lower/number/symbol" })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, {
    message: "adminPassword must include an uppercase letter, lowercase letter, number, and symbol",
  })
  adminPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  adminFirstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  adminLastName!: string;
}
