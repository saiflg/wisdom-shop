import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

export class SavePensionSettingsDto {
  @ApiPropertyOptional({ example: "FCMB Pensions Ltd" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  providerName?: string;

  @ApiPropertyOptional({ example: "United Bank for Africa" })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  remittanceBankName?: string;

  @ApiPropertyOptional({ example: "1005385514" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  remittanceAccountNumber?: string;

  @ApiPropertyOptional({
    description:
      "The employer's share as a percentage OF THE EMPLOYEE'S contribution. 100 matches staff pound for pound; 125 is the statutory 10% employer against 8% employee.",
    example: 100,
    default: 100,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  // Capped well above any real arrangement, so a typo cannot remit ten times
  // the intended amount on a schedule nobody re-reads.
  @Max(1000)
  employerMatchPercent?: number;

  @ApiPropertyOptional({
    description: "Which deduction component carries the employee's contribution.",
    example: "Pension",
  })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  componentLabel?: string;
}
