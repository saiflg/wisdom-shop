import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";

export class CreateVehicleDto {
  @ApiProperty({ example: "Bus 1" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  label!: string;

  @ApiPropertyOptional({ example: "LAG-123-AB" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  plateNumber?: string;

  @ApiPropertyOptional({ example: 30, description: "Seats per run, not per day" })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
  seats?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  driverName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(60)
  driverPhone?: string;
}
