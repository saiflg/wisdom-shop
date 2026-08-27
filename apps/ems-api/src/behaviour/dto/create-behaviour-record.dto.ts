import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

const KINDS = ["MERIT", "CONCERN"] as const;

export class CreateBehaviourRecordDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiPropertyOptional({ description: "Where it happened, when that is a class" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiProperty({ enum: KINDS })
  @IsIn(KINDS as unknown as string[])
  kind!: (typeof KINDS)[number];

  @ApiProperty({ example: "Helpfulness" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  category!: string;

  @ApiProperty({ example: "Stayed behind to help clear up after the science lesson." })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  description!: string;

  /** Always positive; the kind decides which way it counts. */
  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  points?: number;

  /** When it happened, which is not when it was typed up. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  occurredAt?: string;
}
