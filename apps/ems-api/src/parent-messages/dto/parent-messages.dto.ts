import { ApiProperty } from "@nestjs/swagger";
import { IsString, MaxLength } from "class-validator";
import { MAX_MESSAGE_LENGTH } from "@/class-chat/class-chat-rules";

export class PostParentMessageDto {
  @ApiProperty({ maxLength: MAX_MESSAGE_LENGTH })
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body!: string;
}
