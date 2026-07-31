import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class CreateAddressDto {
  @ApiPropertyOptional({ description: 'Nickname for this address, e.g. "Home"' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  label?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  fullName!: string;

  @ApiProperty()
  @IsString()
  @Matches(/^\+?[1-9]\d{6,14}$/, { message: "phone must be a valid E.164 number" })
  phone!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  line1!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  postalCode?: string;

  @ApiProperty({ description: "ISO 3166-1 alpha-2 country code, e.g. NG" })
  @IsString()
  @Matches(/^[A-Z]{2}$/, { message: "country must be a 2-letter ISO code, e.g. NG" })
  country!: string;

  @ApiPropertyOptional({ description: "Make this the default shipping address" })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
