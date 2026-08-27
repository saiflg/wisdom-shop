import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

const KINDS = ["TOPUP", "REFUND", "SPEND", "ADJUSTMENT_CREDIT", "ADJUSTMENT_DEBIT"] as const;

export class RecordWalletEntryDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS as unknown as string[])
  kind!: (typeof KINDS)[number];

  /**
   * Always positive. The direction comes from the kind, never from a sign
   * on the way in — see wallet-math.
   */
  @ApiProperty({ example: 500000, description: "Minor units, always positive" })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ example: "Lunch account top-up" })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  description!: string;

  /**
   * Bank or gateway reference. Unique per wallet, so sending the same one
   * twice returns the first entry rather than crediting again.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
