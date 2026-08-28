import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional } from "class-validator";

export class ReleaseDto {
  /** Defaults to today. Refused if it is before the child moved in. */
  @ApiPropertyOptional({ example: "2026-12-15" })
  @IsOptional()
  @IsDateString()
  releasedOn?: string;
}
