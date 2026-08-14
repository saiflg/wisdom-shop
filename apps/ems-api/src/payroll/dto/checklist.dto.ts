import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class SetChecklistItemDto {
  @ApiProperty({ description: "True to tick, false to untick." })
  @IsBoolean()
  done!: boolean;

  @ApiPropertyOptional({
    example: "Nothing to clear this month",
    description: "Why, when the answer is not simply yes.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  note?: string;
}

export class AddChecklistItemDto {
  @ApiProperty({ example: "Transport allowance reviewed" })
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  label!: string;
}
