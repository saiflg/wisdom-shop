import { Body, Controller, Get, Global, HttpCode, HttpStatus, Module, Post, Put } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsObject } from "class-validator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { SettingsService } from "./settings.service";
import { SETTING_DEFINITIONS, SETTING_GROUPS } from "./settings.registry";
import { MailerService } from "../common/mailer/mailer.service";

export class UpdateSettingsDto {
  /**
   * Only keys in the registry are accepted; the service rejects anything else.
   * An empty string clears a value back to the environment default.
   */
  @IsObject()
  values!: Record<string, string>;
}

@ApiTags("admin/settings")
@ApiBearerAuth()
// SUPER_ADMIN only. These are payment credentials and mail server access —
// a narrower gate than the rest of the admin area, which MANAGER and others
// can reach.
@Roles("SUPER_ADMIN")
@Controller("admin/settings")
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly mailer: MailerService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "All editable settings, with secrets masked",
    description:
      "Secret values are never returned. Each entry reports whether it is configured and whether the value comes from the database or the environment.",
  })
  async list() {
    return { groups: SETTING_GROUPS, settings: await this.settings.describeAll() };
  }

  @Put()
  @ApiOperation({ summary: "Update settings; an empty value reverts to the environment default" })
  async update(@Body() dto: UpdateSettingsDto, @CurrentUser("id") actorUserId: string) {
    await this.settings.setMany(dto.values, actorUserId);
    return { groups: SETTING_GROUPS, settings: await this.settings.describeAll() };
  }

  @Post("email/test")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Open and authenticate an SMTP connection without sending mail",
    description:
      "Saving SMTP settings that quietly do not work is the normal failure mode — nothing surfaces it until a customer never receives a password reset.",
  })
  testEmail(): Promise<{ ok: boolean; message: string }> {
    return this.mailer.verifyConnection();
  }
}

const SOCIAL_KEYS = SETTING_DEFINITIONS.filter((d) => d.group === "social").map((d) => d.key);

/**
 * Unauthenticated: the storefront footer renders for every visitor, logged
 * in or not. Only the social group is exposed here — everything else in the
 * registry is either secret or has no reason to leave the admin screen.
 */
@ApiTags("settings")
@Controller("settings")
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Public()
  @Get("social")
  @ApiOperation({ summary: "Configured social media links, for the storefront footer" })
  async social(): Promise<Record<string, string>> {
    const entries = await Promise.all(
      SOCIAL_KEYS.map(async (key) => [key, await this.settings.get(key)] as const),
    );
    return Object.fromEntries(entries.filter((entry): entry is [string, string] => entry[1] !== undefined));
  }
}

/**
 * Global because payments and the mailer both need it, and threading it
 * through their modules' imports adds nothing.
 */
@Global()
@Module({
  controllers: [SettingsController, PublicSettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
