import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { MODULE_KEYS, type ModuleKey } from "../school-modules";

/**
 * Editable school details.
 *
 * `slug` is deliberately absent. It seeded the database name, it is the
 * school's subdomain, and it is what a user types at login — changing it
 * silently invalidates every bookmark and every saved login while leaving the
 * database named after the old one. A school that needs a different slug
 * needs a migration, not a text field.
 */
export class UpdateSchoolDto {
  @ApiPropertyOptional({ example: "St Mary's College" })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({
    example: "portal.stmarys.sch.ng",
    description:
      "A domain the school owns and points at us. Send an empty string to remove it. A certificate for it is the deployment's problem — see docs/DEPLOYMENT.md.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(253)
  customDomain?: string;
}

export class ModuleToggleDto {
  @ApiPropertyOptional({ enum: MODULE_KEYS })
  @IsIn(MODULE_KEYS)
  module!: ModuleKey;

  @ApiPropertyOptional()
  @IsBoolean()
  enabled!: boolean;
}

export class SetSchoolModulesDto {
  @ApiPropertyOptional({ type: [ModuleToggleDto] })
  @ValidateNested({ each: true })
  @Type(() => ModuleToggleDto)
  modules!: ModuleToggleDto[];

  @ApiPropertyOptional({
    example: "Upgraded to Premium on the 2026-08 renewal",
    description: "Recorded against your account for every module this changes.",
  })
  @IsString()
  @MinLength(4)
  @MaxLength(200)
  reason!: string;
}
