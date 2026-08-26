import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, Length, MaxLength, ValidateIf } from "class-validator";
import { PaymentProvider } from "ems-tenant-client";

export const PAYMENT_PROVIDERS = [
  PaymentProvider.PAYSTACK,
  PaymentProvider.OPAY,
  PaymentProvider.FLUTTERWAVE,
  PaymentProvider.STRIPE,
];

export class UpdatePaymentGatewayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  publicKey?: string;

  @ApiPropertyOptional({ description: "Omit or send empty to keep the stored key; null clears it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  secretKey?: string | null;

  @ApiPropertyOptional({ description: "Omit or send empty to keep the stored secret; null clears it." })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(500)
  webhookSecret?: string | null;

  @ApiPropertyOptional({ example: "NGN", description: "ISO 4217 code." })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: "OPay only. It identifies the merchant in a request header as well as authenticating with a key.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  merchantId?: string;

  @ApiPropertyOptional({
    description:
      "OPay only. Sandbox and live are different hosts; sandbox keys sent to the live host fail in a way that " +
      "looks exactly like a wrong key.",
  })
  @IsOptional()
  @IsBoolean()
  sandbox?: boolean;
}

export class PaymentProviderParamDto {
  @IsIn(PAYMENT_PROVIDERS)
  provider!: PaymentProvider;
}
