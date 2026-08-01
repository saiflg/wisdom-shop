import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from "class-validator";

export class CreateRefundDto {
  @ApiPropertyOptional({
    description:
      "Amount to refund, in minor units (cents/kobo). Omit to refund the whole remaining balance. Never more than what is still refundable.",
    example: 2500,
  })
  @IsOptional()
  // Integer and positive are enforced here as well as in the policy: this
  // rejects "19.99" at the edge, before anything has been written down.
  @IsInt({ message: "amountCents must be a whole number of minor units" })
  @IsPositive({ message: "amountCents must be greater than zero" })
  amountCents?: number;

  @ApiPropertyOptional({ description: "Why the refund was issued. Shown to the customer.", maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({
    description:
      "Send the same key to retry safely — a repeat returns the original refund instead of issuing a second one. Omit only when a genuinely separate refund is intended.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  idempotencyKey?: string;
}
