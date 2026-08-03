import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength, MinLength } from "class-validator";

export class ChangeSchoolStatusDto {
  /**
   * Required, not optional. "This school is locked out" is useless to
   * whoever picks it up next without the reason, and suspension is the one
   * action here that breaks a paying customer's access.
   */
  @ApiProperty({ example: "Non-payment: invoice 4021 overdue 60 days" })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
