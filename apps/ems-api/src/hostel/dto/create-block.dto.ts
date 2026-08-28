import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateBlockDto {
  @ApiProperty({ example: "Yellow House" })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ example: "Mrs Adeyemi" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  wardenName?: string;
}
