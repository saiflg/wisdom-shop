import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";

/**
 * Both fields are optional, and "absent" is meaningfully different from
 * "null" here: absent leaves a field alone, null clears it. A form that
 * sends only the phone number must not silently delete an email address.
 *
 * The shapes themselves are checked in guardian-contact.ts rather than by
 * @IsEmail here, so that the refusal messages read like a person wrote them
 * and so that the rule about locking a parent out of their own account lives
 * beside the other rules instead of being split across two files.
 */
export class UpdateContactDto {
  @ApiPropertyOptional({ nullable: true, description: "Null clears it. Refused if they sign in with it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Stored exactly as typed; never reformatted." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(50)
  phone?: string | null;
}
