import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class BorrowDto {
  @ApiProperty()
  @IsString()
  bookId!: string;

  @ApiProperty()
  @IsString()
  studentProfileId!: string;
}
