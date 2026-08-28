import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

const STATUSES = ["DRAFT", "SHARED", "ACKNOWLEDGED"] as const;

export class TransitionAppraisalDto {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES as unknown as string[])
  to!: (typeof STATUSES)[number];

  /**
   * What the person says when acknowledging. Their right of reply, stored
   * beside the appraisal rather than nowhere.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
