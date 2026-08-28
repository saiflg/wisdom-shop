import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional, IsString } from "class-validator";

const DIRECTIONS = ["MORNING", "AFTERNOON", "BOTH"] as const;

export class AssignDto {
  @ApiProperty()
  @IsString()
  routeId!: string;

  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiPropertyOptional({ description: "Where they get on" })
  @IsOptional()
  @IsString()
  stopId?: string;

  @ApiProperty({ enum: DIRECTIONS, default: "BOTH" })
  @IsIn(DIRECTIONS as unknown as string[])
  direction!: (typeof DIRECTIONS)[number];
}
