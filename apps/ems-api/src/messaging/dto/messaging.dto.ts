import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, MaxLength } from "class-validator";

export class UpdateTemplateDto {
  @ApiPropertyOptional({ description: "Email only; ignored for SMS and WhatsApp" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  subject?: string;

  @ApiPropertyOptional({ description: "May use {{placeholders}} the event supplies" })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  body?: string;

  @ApiPropertyOptional({ description: "Turn this notification off without losing the wording" })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
