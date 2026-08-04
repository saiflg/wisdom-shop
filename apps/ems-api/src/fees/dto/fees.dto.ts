import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export const FEE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CARD", "MOBILE_MONEY", "GATEWAY", "OTHER"] as const;

export class UpdateFinanceSettingsDto {
  @ApiPropertyOptional({ example: "NGN", description: "ISO 4217 code" })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;
}

export class FeeItemDto {
  @ApiProperty({ example: "Tuition" })
  @IsString()
  @MaxLength(120)
  label!: string;

  /**
   * Minor units, and an integer at the validation layer rather than only in
   * the maths. `25000.5` naira reaching the service at all means someone has
   * confused major and minor units, and it should be rejected at the door.
   */
  @ApiProperty({ example: 25000000, description: "Minor units (kobo/cents), never a decimal" })
  @IsInt()
  @Min(0)
  amountCents!: number;
}

export class CreateFeeStructureDto {
  @ApiProperty({ example: "Term 1 Fees" })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MaxLength(20)
  academicYear!: string;

  @ApiProperty({ example: "Term 1" })
  @IsString()
  @MaxLength(40)
  term!: string;

  @ApiPropertyOptional({ description: "Omit for a school-wide structure" })
  @IsOptional()
  @IsString()
  classId?: string;

  @ApiProperty({ type: [FeeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeItemDto)
  items!: FeeItemDto[];
}

export class UpdateFeeStructureDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ type: [FeeItemDto], description: "Replaces the whole item list when given" })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeItemDto)
  items?: FeeItemDto[];
}

export class GenerateInvoicesDto {
  @ApiPropertyOptional({ example: "2026-11-30", description: "Due date applied to every invoice raised" })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;
}

export class CreateFeeInvoiceDto {
  @ApiProperty()
  @IsString()
  studentProfileId!: string;

  @ApiProperty({ example: "2026-2027" })
  @IsString()
  @MaxLength(20)
  academicYear!: string;

  @ApiProperty({ example: "Term 1" })
  @IsString()
  @MaxLength(40)
  term!: string;

  @ApiProperty({ type: [FeeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FeeItemDto)
  lines!: FeeItemDto[];

  @ApiPropertyOptional({ example: "2026-11-30" })
  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class RecordPaymentDto {
  @ApiProperty({ example: 25000000, description: "Minor units. Must not exceed the outstanding balance." })
  @IsInt()
  @Min(1)
  amountCents!: number;

  @ApiProperty({ enum: FEE_PAYMENT_METHODS })
  @IsIn(FEE_PAYMENT_METHODS)
  method!: (typeof FEE_PAYMENT_METHODS)[number];

  /**
   * Bank or gateway reference. Optional because cash has none — but when it
   * is given, it is unique per invoice, which is what stops a replayed
   * webhook or a double-clicked form from crediting twice.
   */
  @ApiPropertyOptional({ example: "PSK-REF-88213" })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  reference?: string;

  @ApiPropertyOptional({ example: "2026-09-14" })
  @IsOptional()
  @IsISO8601()
  receivedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class VoidInvoiceDto {
  @ApiProperty({ example: "Raised against the wrong student" })
  @IsString()
  @MaxLength(300)
  reason!: string;
}
