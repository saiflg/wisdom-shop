import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { STRONG_PASSWORD_REGEX } from "@/schools/strong-password.regex";

const RESERVED_SLUGS = new Set(["control", "admin", "platform", "template", "www", "api"]);

/**
 * Becomes part of a raw `CREATE DATABASE` identifier (see
 * ProvisioningService), so validated strictly rather than merely
 * sanitized: lowercase letters, digits and hyphens only, 3-32 chars,
 * not starting/ending in a hyphen, and not a reserved word.
 */
export function isValidSchoolSlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

export class CreateSchoolDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: "Lowercase letters, digits, hyphens; 3-32 chars" })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, {
    message: "slug must be lowercase letters, digits and hyphens only (3-32 chars)",
  })
  slug!: string;

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
