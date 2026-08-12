import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsObject, IsOptional, IsString, Validate } from "class-validator";
import {
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from "class-validator";

/**
 * class-validator has no decorator for "an object whose values are class ids
 * or null", and the shape matters: a stray value here decides where somebody's
 * child ends up. Validated explicitly rather than trusted.
 */
@ValidatorConstraint({ name: "classMappings", async: false })
class ClassMappingsValid implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.entries(value).every(
      ([key, target]) =>
        typeof key === "string" &&
        key.length > 0 &&
        (target === null || (typeof target === "string" && target.length > 0)),
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must map each class id to a destination class id, or to null to graduate that class`;
  }
}

@ValidatorConstraint({ name: "promotionOverrides", async: false })
class OverridesValid implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === undefined) return true;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    return Object.values(value).every(
      (choice) => choice === "PROMOTE" || choice === "REPEAT" || choice === "GRADUATE",
    );
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} values must be PROMOTE, REPEAT or GRADUATE`;
  }
}

export class PromotionRequestDto {
  @ApiProperty({ example: "2025-2026" })
  @IsString()
  @IsNotEmpty()
  fromAcademicYear!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @IsNotEmpty()
  toAcademicYear!: string;

  @ApiProperty({
    description: "Source class id -> destination class id, or null to graduate that class",
    example: { cls_jss1: "cls_jss2", cls_jss3: null },
  })
  @IsObject()
  @Validate(ClassMappingsValid)
  classMappings!: Record<string, string | null>;

  @ApiPropertyOptional({
    description: "Per-student departures from their class's decision",
    example: { stu_abc: "REPEAT" },
  })
  @IsOptional()
  @IsObject()
  @Validate(OverridesValid)
  overrides?: Record<string, "PROMOTE" | "REPEAT" | "GRADUATE">;
}
