import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength, MinLength } from "class-validator";
import { STRONG_PASSWORD_REGEX } from "@/schools/strong-password.regex";

export class AcceptInvitationDto {
  @ApiProperty({ description: "The school this invitation was issued by" })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  schoolSlug!: string;

  @ApiProperty({ description: "The one-time token from the invitation link" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  token!: string;

  @ApiProperty({ description: "Chosen by the parent. The school never sees it." })
  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(STRONG_PASSWORD_REGEX, {
    message: "password must include an uppercase letter, lowercase letter, number, and symbol",
  })
  password!: string;
}

export class CheckInvitationDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  schoolSlug!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  token!: string;
}
