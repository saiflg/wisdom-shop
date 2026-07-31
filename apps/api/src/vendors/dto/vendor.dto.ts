import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";
import { VendorStatus } from "@prisma/client";

export class ApplyVendorDto {
  @ApiProperty({ description: "Public storefront name" })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  storeName!: string;

  @ApiPropertyOptional({ description: "URL slug; generated from storeName when omitted" })
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/, { message: "slug must be lowercase, alphanumeric, hyphen-separated" })
  slug?: string;
}

export class UpdateVendorStatusDto {
  @ApiProperty({ enum: VendorStatus })
  @IsEnum(VendorStatus)
  status!: VendorStatus;

  @ApiPropertyOptional({
    description: "Commission percentage to apply from now on. Existing orders keep their snapshotted rate.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionPct?: number;
}
