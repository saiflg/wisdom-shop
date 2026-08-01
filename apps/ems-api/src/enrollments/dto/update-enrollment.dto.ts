import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";

export enum EnrollmentStatusDto {
  ACTIVE = "ACTIVE",
  COMPLETED = "COMPLETED",
  WITHDRAWN = "WITHDRAWN",
}

export class UpdateEnrollmentDto {
  @ApiProperty({ enum: EnrollmentStatusDto })
  @IsEnum(EnrollmentStatusDto)
  status!: EnrollmentStatusDto;
}
