import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const STATUSES = ["REQUESTED", "APPROVED", "PAID", "DECLINED"] as const;

export class DecideWelfareDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  to!: (typeof STATUSES)[number];

  @ApiPropertyOptional({ description: "Required when declining" })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
