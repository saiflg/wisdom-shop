import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsDate, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";

export class CreateLoanDto {
  @ApiProperty()
  @IsString()
  staffProfileId!: string;

  @ApiPropertyOptional({ enum: ["LOAN", "SALARY_ADVANCE"], default: "LOAN" })
  @IsOptional()
  @IsIn(["LOAN", "SALARY_ADVANCE"])
  kind?: "LOAN" | "SALARY_ADVANCE";

  @ApiPropertyOptional({ description: "Left blank, the school's next sequential reference is used." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  reference?: string;

  @ApiProperty({ description: "Minor units, e.g. 5000000 for ₦50,000.00" })
  @IsInt()
  @Min(1)
  principalCents!: number;

  @ApiPropertyOptional({
    description: "Recovered from each salary. Zero means the whole balance comes off the next run.",
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyDeductionCents?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issuedOn?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RepayLoanDto {
  @ApiProperty({ description: "Minor units. Capped at the outstanding balance." })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiPropertyOptional({
    description:
      "The payroll run this came off. Supplying it makes the repayment idempotent — the same run can never deduct twice.",
  })
  @IsOptional()
  @IsString()
  runId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  paidOn?: Date;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CloseLoanDto {
  @ApiProperty({
    enum: ["WRITTEN_OFF", "CANCELLED"],
    description:
      "WRITTEN_OFF forgives a real debt; CANCELLED withdraws a loan recorded in error. Neither is a repayment — recording forgiveness as one would make the books say money was recovered that never was.",
  })
  @IsIn(["WRITTEN_OFF", "CANCELLED"])
  status!: "WRITTEN_OFF" | "CANCELLED";

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
