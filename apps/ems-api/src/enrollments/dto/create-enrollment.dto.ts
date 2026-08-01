import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class CreateEnrollmentDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiProperty()
  @IsString()
  classId!: string;
}
