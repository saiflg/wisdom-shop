import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class CreateSectionDto {
  @ApiProperty({ example: "Primary" })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @ApiPropertyOptional({ example: "Nursery 1 through Grade 6" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  /**
   * Where this sits when a school reads its own list.
   *
   * Not required: a school adding its first three sections in order should
   * not have to think about numbers, so an omitted position is filled in by
   * the service as "after everything that already exists".
   */
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  position?: number;

  @ApiPropertyOptional({ description: "User id of the teacher who heads this part of the school" })
  @IsOptional()
  @IsString()
  headId?: string;
}
