import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const STATUSES = ["REQUESTED", "APPROVED", "PAID", "REJECTED"] as const;

export class DecideExpenseDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  to!: (typeof STATUSES)[number];

  /** Required when turning a request down — see the service. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @ApiPropertyOptional({ example: "TRANSFER" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  method?: string;

  @ApiPropertyOptional({ description: "Bank reference, once it has been paid" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;
}
