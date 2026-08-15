import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { MAX_MESSAGE_LENGTH } from "../class-chat-rules";

export class PostMessageDto {
  /**
   * Optional at this layer, required in practice.
   *
   * A message with no words is still a message when a photograph or a voice
   * note is attached, and the emptiness rule lives in checkMessage where it
   * can see whether there is a file. Enforcing non-empty here as well would
   * mean a picture could never be sent without a caption.
   */
  @ApiPropertyOptional({ maxLength: MAX_MESSAGE_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(MAX_MESSAGE_LENGTH)
  body?: string;

  /**
   * Voice notes only, and only ever a hint.
   *
   * The browser measures it; nothing important depends on it being honest,
   * because it is used to print "0:14" beside a player and for a length cap
   * whose real enforcement is the byte size.
   */
  @ApiPropertyOptional({ description: "Length of a voice note in seconds" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  durationSeconds?: number;
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
