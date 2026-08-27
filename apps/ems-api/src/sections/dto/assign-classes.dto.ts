import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, IsArray, IsString } from "class-validator";

export class AssignClassesDto {
  /**
   * The classes that belong to this section, as the whole set rather than a
   * delta.
   *
   * Sending the full membership makes the request idempotent: retrying it
   * after a dropped connection cannot half-apply, and two admins editing the
   * same section cannot interleave into a state neither of them chose.
   */
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(500)
  classIds!: string[];
}
