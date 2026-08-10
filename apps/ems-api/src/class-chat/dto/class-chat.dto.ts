import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { MAX_MESSAGE_LENGTH } from "../class-chat-rules";

export class PostMessageDto {
  @ApiProperty({ maxLength: MAX_MESSAGE_LENGTH })
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body!: string;
}

export class ReportMessageDto {
  @ApiProperty({
    example: "This is unkind about someone in our class",
    description: "What the reporter says is wrong with it. Shown to staff, never to the author.",
  })
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class LockConversationDto {
  @ApiProperty({ description: "True pauses students posting; teachers can still write." })
  @IsBoolean()
  locked!: boolean;

  @ApiPropertyOptional({ example: "Paused during the lesson" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
