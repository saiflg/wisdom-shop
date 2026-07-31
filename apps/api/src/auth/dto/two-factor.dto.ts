import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length, Matches } from "class-validator";

export class TwoFactorCodeDto {
  @ApiProperty({ description: "6-digit TOTP code" })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: "code must be 6 digits" })
  code!: string;
}

export class DisableTwoFactorDto extends TwoFactorCodeDto {
  @ApiProperty()
  @IsString()
  password!: string;
}
