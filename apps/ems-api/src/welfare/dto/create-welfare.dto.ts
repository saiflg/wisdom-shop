import { ApiProperty } from "@nestjs/swagger";
import { IsIn, IsInt, IsString, MaxLength, Min, MinLength } from "class-validator";

const KINDS = ["MEDICAL", "HARDSHIP", "BEREAVEMENT", "LOAN", "OTHER"] as const;

export class CreateWelfareDto {
  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS as unknown as string[])
  kind!: (typeof KINDS)[number];

  @ApiProperty({ example: "Hospital bill" })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;

  @ApiProperty({ example: 5000000, description: "Minor units, always positive" })
  @IsInt()
  @Min(1)
  amountCents!: number;
}
