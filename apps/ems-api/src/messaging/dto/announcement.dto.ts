import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { AUDIENCES } from "../announcement-audience";

export class AnnouncementDto {
  @ApiProperty({ example: "School closed on Friday" })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @ApiProperty({ example: "The school will be closed on Friday 21st for a public holiday." })
  @IsString()
  @MinLength(1)
  // Long enough for a real notice, short enough to fit in a handful of text
  // messages rather than a surprise bill.
  @MaxLength(2000)
  body!: string;

  @ApiProperty({ enum: AUDIENCES as unknown as string[] })
  @IsIn(AUDIENCES as unknown as string[])
  audience!: string;

  @ApiPropertyOptional({ description: "Required when the audience is CLASS" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiProperty({ example: ["EMAIL"], description: "EMAIL, SMS, or both" })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsIn(["EMAIL", "SMS"], { each: true })
  channels!: string[];
}

/**
 * A draft.
 *
 * Everything except the title is optional, on purpose. A draft is a notice
 * somebody started and has not finished, and refusing to save one until the
 * audience and channels are chosen would mean losing the paragraph they had
 * already written. The send-time DTO above is what enforces completeness.
 */
export class AnnouncementDraftDto {
  @ApiProperty({ example: "Half term" })
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({ enum: AUDIENCES as unknown as string[] })
  @IsOptional()
  @IsIn(AUDIENCES as unknown as string[])
  audience?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiPropertyOptional({ example: ["EMAIL"] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2)
  @IsIn(["EMAIL", "SMS"], { each: true })
  channels?: string[];
}
