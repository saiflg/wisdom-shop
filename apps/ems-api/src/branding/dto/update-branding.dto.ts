import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength, Matches, ValidateIf } from "class-validator";
import { SUPPORTED_LOCALES } from "../locale-policy";

/**
 * Six- or three-digit hex only, checked here as well as in branding-rules so
 * a bad colour is a 400 with a readable message rather than a 500 out of
 * `normaliseHexColor`.
 */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export class UpdateBrandingDto {
  @ApiPropertyOptional({ description: "Overrides the registered school name in the UI" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(120)
  displayName?: string | null;

  @ApiPropertyOptional({ description: "One line under the school name on the login page" })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(160)
  tagline?: string | null;

  @ApiPropertyOptional({ example: "#1d4ed8" })
  @IsOptional()
  @Matches(HEX, { message: "primaryColor must be a hex colour such as #1d4ed8" })
  primaryColor?: string;

  @ApiPropertyOptional({ example: "#0f766e" })
  @IsOptional()
  @Matches(HEX, { message: "accentColor must be a hex colour such as #0f766e" })
  accentColor?: string;

  /**
   * The language the console opens in for this school.
   *
   * Validated against what the build actually ships rather than as a free
   * string: a school saving "sw" would otherwise store a preference that
   * silently never applies.
   */
  @ApiPropertyOptional({ enum: SUPPORTED_LOCALES as unknown as string[], example: "fr" })
  @IsOptional()
  @IsIn(SUPPORTED_LOCALES as unknown as string[], {
    message: "defaultLocale must be one of: " + SUPPORTED_LOCALES.join(", "),
  })
  defaultLocale?: string;
}
