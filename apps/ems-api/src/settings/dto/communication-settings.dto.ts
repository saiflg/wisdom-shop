import { ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { SmtpEncryption } from "ems-tenant-client";

const SMTP_ENCRYPTIONS = [SmtpEncryption.NONE, SmtpEncryption.TLS, SmtpEncryption.SSL];

/**
 * Secret fields accept `null` to clear and omit/empty to leave unchanged —
 * see secret-update.ts. `@ValidateIf(v => v !== null)` is what lets an
 * explicit null through while still validating a supplied string.
 */
export class UpdateEmailGatewayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  host?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  port?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  username?: string;

  @ApiPropertyOptional({ description: "Omit or send empty to keep the stored password; null clears it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  password?: string | null;

  @ApiPropertyOptional({ enum: SMTP_ENCRYPTIONS })
  @IsOptional()
  @IsIn(SMTP_ENCRYPTIONS)
  encryption?: SmtpEncryption;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  senderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  senderEmail?: string;
}

export class UpdateSmsGatewayDto {
  @ApiPropertyOptional({ description: "Free text — schools choose their own SMS vendor." })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  baseUrl?: string;

  @ApiPropertyOptional({ description: "Omit or send empty to keep the stored key; null clears it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  apiKey?: string | null;

  @ApiPropertyOptional({ description: "Omit or send empty to keep the stored secret; null clears it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  apiSecret?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  senderId?: string;
}

export class UpdateWhatsAppGatewayDto {
  @ApiPropertyOptional({ description: "Omit or send empty to keep the stored token; null clears it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(1000)
  accessToken?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  phoneNumberId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(64)
  businessAccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ require_tld: false })
  webhookUrl?: string;

  @ApiPropertyOptional({ description: "Omit or send empty to keep the stored token; null clears it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(255)
  webhookVerifyToken?: string | null;
}

export class UpdatePushGatewayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  providerName?: string;

  @ApiPropertyOptional({ description: "Provider-specific JSON credentials. Omit or send empty to keep; null clears." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(8000)
  credentials?: string | null;
}

export class TestEmailDto {
  @ApiPropertyOptional({ description: "Where to send the test. Defaults to the configured sender address." })
  @IsOptional()
  @IsEmail()
  to?: string;
}

export class TestSmsDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(32)
  to!: string;
}

export class TestWhatsAppDto {
  @ApiPropertyOptional()
  @IsString()
  @MaxLength(32)
  to!: string;
}

export class TestPaymentGatewayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  liveMode?: boolean;
}
