import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateRouteDto {
  @ApiProperty({ example: "Ikeja morning run" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ description: "The bus doing this run. A route without one has no seats." })
  @IsOptional()
  @IsString()
  vehicleId?: string;
}
