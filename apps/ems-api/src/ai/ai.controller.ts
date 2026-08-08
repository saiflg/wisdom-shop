import { Body, Controller, Get, HttpCode, Post, Put, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from "@nestjs/swagger";
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import type { AiProvider } from "ems-control-client";
import { Public } from "@/auth/decorators/public.decorator";
import { PlatformJwtAuthGuard } from "@/platform-auth/guards/platform-jwt-auth.guard";
import { PlatformRolesGuard } from "@/platform-auth/guards/platform-roles.guard";
import { PlatformRoles } from "@/platform-auth/decorators/platform-roles.decorator";
import { AiService } from "./ai.service";
import { PROVIDERS } from "./providers";

const PROVIDER_IDS = PROVIDERS.map((provider) => provider.id) as [AiProvider, ...AiProvider[]];

export class UpdateAiSettingsDto {
  @ApiProperty({ enum: PROVIDER_IDS })
  @IsIn(PROVIDER_IDS)
  provider!: AiProvider;

  @ApiPropertyOptional({ description: "Blank falls back to the provider's default" })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @ApiPropertyOptional({ description: "Only used by the OpenAI-compatible provider" })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  baseUrl?: string;

  @ApiPropertyOptional({
    description: "Stored encrypted and never returned. Omit to keep the current key; send empty to clear it.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(400)
  apiKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/**
 * Platform-wide AI configuration, owned by the Super Admin.
 *
 * Under `/platform` because the key belongs to whoever runs the platform and
 * is billed to them; a school administrator must not be able to read it,
 * change it, or point generation at a provider of their own.
 */
@ApiTags("platform-ai")
@ApiBearerAuth()
@Public()
@UseGuards(PlatformJwtAuthGuard, PlatformRolesGuard)
@Controller("platform/ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("providers")
  @PlatformRoles("PLATFORM_ADMIN")
  @ApiOperation({ summary: "The providers on offer, with their defaults" })
  providers() {
    return PROVIDERS.map((provider) => ({
      id: provider.id,
      label: provider.label,
      defaultModel: provider.defaultModel,
      keyUrl: provider.keyUrl ?? null,
      needsBaseUrl: Boolean(provider.needsBaseUrl),
    }));
  }

  @Get("settings")
  @PlatformRoles("PLATFORM_ADMIN")
  @ApiOperation({
    summary: "Current AI settings",
    description: "The API key is returned masked. There is no route that returns it in full.",
  })
  settings() {
    return this.ai.getSettingsView();
  }

  @Put("settings")
  @PlatformRoles("PLATFORM_ADMIN")
  @ApiOperation({ summary: "Choose a provider and save its key" })
  update(@Body() dto: UpdateAiSettingsDto) {
    return this.ai.updateSettings(dto);
  }

  @Post("test")
  @HttpCode(200)
  @PlatformRoles("PLATFORM_ADMIN")
  @ApiOperation({
    summary: "Prove the key works",
    description:
      "Makes one small real request. Without this the first sign of a wrong key is a teacher's generation " +
      "failing mid-lesson-planning.",
  })
  test() {
    return this.ai.testConnection();
  }
}
