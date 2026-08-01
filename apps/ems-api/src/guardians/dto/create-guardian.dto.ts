import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { STRONG_PASSWORD_REGEX } from "@/schools/strong-password.regex";

export class CreateGuardianDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiProperty({ example: "Mother" })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  relationship!: string;

  @ApiPropertyOptional({ description: "Omit to link an existing guardian by email instead" })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiProperty({ description: "If this email already exists, that guardian is linked; otherwise a new guardian is created" })
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiPropertyOptional({ description: "Required only when creating a brand-new guardian" })
  @IsOptional()
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, {
    message: "password must include an uppercase letter, lowercase letter, number, and symbol",
  })
  password?: string;
}
