import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ValidateNested } from "class-validator";
import { SchemeOfWorkContentDto } from "./scheme-of-work-content.dto";

export class UpdateSchemeOfWorkDto {
  @ApiProperty({ type: SchemeOfWorkContentDto })
  @ValidateNested()
  @Type(() => SchemeOfWorkContentDto)
  content!: SchemeOfWorkContentDto;
}
